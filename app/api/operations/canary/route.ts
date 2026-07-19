import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { mockLeads } from "@/lib/mock-data";
import { orchestrateWhatsAppConversationReply } from "@/lib/whatsapp-reply-decision";
import { validateWhatsAppAutoReply } from "@/lib/whatsapp-safety";
import { evaluateWhatsAppReplyQuality } from "@/lib/ai-quality";
import { createTraceId, getOperationsSloSnapshot, recordOperationalEvent } from "@/lib/operations/observability";
import { purgeExpiredWhatsAppWebhookFailures } from "@/lib/data/whatsapp-webhook-failures-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET || "";
  const authorization = request.headers.get("authorization") || "";
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true;
  const auth = await getCurrentProfile();
  return Boolean(auth.authenticated && auth.profile && ["boss", "admin"].includes(auth.profile.role));
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const traceId = createTraceId(request);
  const startedAt = performance.now();

  try {
    const fixture = {
      ...mockLeads[0],
      id: "00000000-0000-4000-8000-000000000001",
      clientName: "Synthetic Canary",
      phone: "00000000",
      propertyType: "HDB",
      scopeSummary: "Kitchen renovation",
      botPaused: false,
      leadEligible: true,
      intentClassifiedAt: new Date().toISOString(),
      conversationIntent: "genuine_new_renovation_lead" as const,
      conversationRoute: "sales_lead" as const
    };
    const decision = orchestrateWhatsAppConversationReply({
      inboundMessageText: "Hi, I need help renovating my HDB kitchen.",
      inboundMessageType: "text",
      lead: fixture,
      previousMessages: [],
      autoReplyEnabled: true,
      openAiEnabled: false,
      providerMessageId: "synthetic-canary-inbound"
    });
    const safety = validateWhatsAppAutoReply(decision.replyText);
    const quality = evaluateWhatsAppReplyQuality(decision.replyText);
    const passed = decision.leadEligible && decision.shouldReply && safety.ok && quality.releaseEligible;
    const [schema, failureRetention] = await Promise.all([
      getOperationsSloSnapshot(),
      purgeExpiredWhatsAppWebhookFailures()
    ]);
    const canaryPassed = passed && schema.schemaReady && failureRetention.ok;
    await recordOperationalEvent({
      traceId,
      leadId: null,
      eventName: "synthetic_pipeline_canary",
      stage: "planner_to_safety_no_send",
      status: canaryPassed ? "ok" : "degraded",
      durationMs: performance.now() - startedAt,
      errorCode: !passed
        ? "reply_pipeline_gate_failed"
        : !schema.schemaReady
          ? "schema_not_ready"
          : failureRetention.ok
            ? ""
            : "failure_retention_degraded",
      metadata: {
        replyPlanned: Boolean(decision.replyText),
        intentEligible: decision.leadEligible,
        safetyPassed: safety.ok,
        qualityScore: quality.overall,
        schemaReady: schema.schemaReady,
        failureRetentionReady: failureRetention.ok,
        expiredFailureRowsDeleted: failureRetention.deletedCount,
        externalSendAttempted: false
      }
    });
    return NextResponse.json({
      ok: canaryPassed,
      traceId,
      canary: {
        planner: decision.blackBoxTrace.plannerVersion || "single_reply_planner",
        intentEligible: decision.leadEligible,
        replyPlanned: Boolean(decision.replyText),
        safetyPassed: safety.ok,
        qualityScore: quality.overall,
        schemaReady: schema.schemaReady,
        failureRetentionReady: failureRetention.ok,
        expiredFailureRowsDeleted: failureRetention.deletedCount,
        externalSendAttempted: false
      }
    }, { status: canaryPassed ? 200 : 503, headers: { "X-LIMM-Trace-Id": traceId } });
  } catch (error) {
    await recordOperationalEvent({ traceId, eventName: "synthetic_pipeline_canary", stage: "planner_to_safety_no_send", status: "failed", durationMs: performance.now() - startedAt, errorCode: error instanceof Error ? error.name : "canary_failed" }).catch(() => false);
    return NextResponse.json({ ok: false, traceId, error: "canary_failed", externalSendAttempted: false }, { status: 500, headers: { "X-LIMM-Trace-Id": traceId } });
  }
}
