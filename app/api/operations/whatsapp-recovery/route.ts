import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/data/audit-repository";
import {
  listPendingWhatsAppWebhookFailures,
  recoverWhatsAppWebhookFailureToCrm
} from "@/lib/data/whatsapp-webhook-failures-repository";
import { createTraceId, recordOperationalEvent } from "@/lib/operations/observability";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/operations/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireBoss() {
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) return { ok: false as const, status: 401, error: "unauthorized" };
  if (auth.profile.role !== "boss") return { ok: false as const, status: 403, error: "boss_access_required" };
  return { ok: true as const, actor: auth.profile };
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const access = await requireBoss();
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const rate = await consumeRateLimit({ identity: access.actor.id, action: "whatsapp_recovery_read", limit: 30, windowSeconds: 60 });
  if (!rate.allowed) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(rate) });

  const queue = await listPendingWhatsAppWebhookFailures();
  return NextResponse.json(
    { ok: queue.available, available: queue.available, items: queue.items },
    { status: queue.available ? 200 : 503, headers: { ...rateLimitHeaders(rate), "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const access = await requireBoss();
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  const rate = await consumeRateLimit({ identity: access.actor.id, action: "whatsapp_recovery_write", limit: 10, windowSeconds: 60 });
  if (!rate.allowed) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(rate) });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400, headers: rateLimitHeaders(rate) });
  }
  const action = typeof payload.action === "string" ? payload.action : "";
  const failureId = typeof payload.failureId === "string" ? payload.failureId : "";
  if (action !== "recover") return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400, headers: rateLimitHeaders(rate) });
  if (!UUID_PATTERN.test(failureId)) return NextResponse.json({ ok: false, error: "invalid_failure_id" }, { status: 400, headers: rateLimitHeaders(rate) });

  const traceId = createTraceId(request);
  const startedAt = performance.now();
  try {
    const result = await recoverWhatsAppWebhookFailureToCrm(failureId);
    if (!result.ok) {
      const status = result.status === "not_found" ? 404 : 503;
      return NextResponse.json({ ok: false, error: result.status, traceId }, { status, headers: { ...rateLimitHeaders(rate), "X-LIMM-Trace-Id": traceId } });
    }
    await createAuditLog({
      actorType: access.actor.role,
      actorName: access.actor.fullName,
      actorEmail: access.actor.email,
      actorId: access.actor.id,
      action: "whatsapp_failure_recovered_to_crm",
      entityType: "whatsapp_webhook_failure",
      entityId: failureId,
      summary: result.status === "already_recovered"
        ? "Boss confirmed a preserved inbound WhatsApp message was already recovered without sending a client reply."
        : "Boss recovered a preserved inbound WhatsApp message into the CRM without sending a client reply.",
      afterData: { leadId: result.leadId, recoveryStatus: result.status, externalSendAttempted: false },
      metadata: { traceId, recoveryMode: "crm_only_no_send" }
    });
    await recordOperationalEvent({
      traceId,
      leadId: result.leadId,
      eventName: "whatsapp_failure_recovery",
      stage: "crm_only_no_send",
      status: "ok",
      durationMs: performance.now() - startedAt,
      metadata: { alreadyRecovered: result.status === "already_recovered", externalSendAttempted: false }
    }).catch(() => false);
    return NextResponse.json(
      { ok: true, traceId, status: result.status, leadId: result.leadId, externalSendAttempted: false },
      { headers: { ...rateLimitHeaders(rate), "X-LIMM-Trace-Id": traceId, "Cache-Control": "no-store" } }
    );
  } catch (error) {
    await recordOperationalEvent({
      traceId,
      eventName: "whatsapp_failure_recovery",
      stage: "crm_only_no_send",
      status: "failed",
      durationMs: performance.now() - startedAt,
      errorCode: error instanceof Error ? error.message.slice(0, 100) : "recovery_failed"
    }).catch(() => false);
    return NextResponse.json(
      { ok: false, error: "recovery_failed", traceId, externalSendAttempted: false },
      { status: 500, headers: { ...rateLimitHeaders(rate), "X-LIMM-Trace-Id": traceId, "Cache-Control": "no-store" } }
    );
  }
}
