import { after, NextRequest, NextResponse } from "next/server";
import { getWhatsAppRuntime } from "@/lib/whatsapp-config";
import { parseWhatsAppInbound, parseWhatsAppStatuses } from "@/lib/whatsapp-parser";
import { verifyWhatsAppWebhookSignature } from "@/lib/whatsapp-webhook-signature";
import { getSupabasePublicKey } from "@/lib/data/data-source";
import { hasSupabaseAdminEnv } from "@/lib/data/supabase-admin";
import {
  applyWhatsAppDeliveryStatuses,
  enqueueWhatsAppInboundMessages
} from "@/lib/data/whatsapp-inbound-jobs-repository";
import { processWhatsAppInboundJob } from "@/lib/whatsapp-inbound-worker";
import { createTraceId, recordOperationalEvent } from "@/lib/operations/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const challenge = search.get("hub.challenge") ?? "";
  if (search.get("hub.mode") === "subscribe" && process.env.WHATSAPP_VERIFY_TOKEN && search.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function envMissing(name: string) {
  return !process.env[name];
}

function getMissingWebhookConfig() {
  const runtime = getWhatsAppRuntime();
  const missing: string[] = [];
  if (envMissing("NEXT_PUBLIC_SUPABASE_URL")) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!getSupabasePublicKey()) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!hasSupabaseAdminEnv()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (envMissing("WHATSAPP_VERIFY_TOKEN")) missing.push("WHATSAPP_VERIFY_TOKEN");
  if (envMissing("WHATSAPP_APP_SECRET")) missing.push("WHATSAPP_APP_SECRET");
  if (!runtime.liveInboundEnabled) missing.push("WHATSAPP_LIVE_INBOUND_ENABLED=true");
  if (!runtime.autoReplyModeAllowed) missing.push("WHATSAPP_AUTO_REPLY_MODE_VALID");
  if (runtime.testAutoReplyEnabled) {
    if (envMissing("WHATSAPP_PHONE_NUMBER_ID")) missing.push("WHATSAPP_PHONE_NUMBER_ID");
    if (envMissing("WHATSAPP_ACCESS_TOKEN")) missing.push("WHATSAPP_ACCESS_TOKEN");
    if (envMissing("WHATSAPP_BUSINESS_NUMBER")) missing.push("WHATSAPP_BUSINESS_NUMBER");
  }
  return { runtime, missing };
}

function safeReason(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown WhatsApp webhook failure.")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/(access_token=)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .slice(0, 260);
}

export async function POST(request: NextRequest) {
  const traceId = createTraceId(request);
  const startedAt = performance.now();
  console.info("whatsapp_webhook_received_start");
  try {
    const rawBodyBuffer = Buffer.from(await request.arrayBuffer());
    console.info("whatsapp_signature_check_started");
    const signatureResult = verifyWhatsAppWebhookSignature({
      rawBody: rawBodyBuffer,
      signature: request.headers.get("x-hub-signature-256"),
      appSecret: process.env.WHATSAPP_APP_SECRET
    });
    if (!signatureResult.ok) {
      if (signatureResult.reason === "missing_app_secret") {
        return NextResponse.json(
          { ok: false, error: "config_error", code: "webhook_signature_config_error" },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { ok: false, error: "unauthorized", code: "invalid_webhook_signature" },
        { status: 401 }
      );
    }
    console.info("whatsapp_signature_verified");
    await recordOperationalEvent({ traceId, eventName: "whatsapp_webhook", stage: "signature_verified", status: "started" }).catch(() => false);

    let payload: unknown;
    try {
      const rawBody = rawBodyBuffer.toString("utf8");
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ ok: false, error: "payload_parse_failed" }, { status: 400 });
    }

    const messages = parseWhatsAppInbound(payload);
    const statuses = parseWhatsAppStatuses(payload);
    const { runtime: whatsappRuntime, missing } = getMissingWebhookConfig();
    console.info("whatsapp_payload_parsed", { messageCount: messages.length, statusCount: statuses.length });
    console.info("whatsapp_config_checked", {
      liveInboundEnabled: whatsappRuntime.liveInboundEnabled,
      testAutoReplyEnabled: whatsappRuntime.testAutoReplyEnabled,
      publicAutoReplyEnabled: whatsappRuntime.publicAutoReplyEnabled,
      testMode: whatsappRuntime.testMode,
      hasSupabaseUrl: !envMissing("NEXT_PUBLIC_SUPABASE_URL"),
      hasSupabaseAnonKey: Boolean(getSupabasePublicKey()),
      hasServiceRoleKey: hasSupabaseAdminEnv()
    });
    console.info("whatsapp_auto_reply_enabled_state", whatsappRuntime);
    if (missing.length) {
      await recordOperationalEvent({ traceId, eventName: "whatsapp_webhook", stage: "config_check", status: "failed", durationMs: performance.now() - startedAt, errorCode: "config_error", metadata: { missingCount: missing.length } }).catch(() => false);
      return NextResponse.json({ ok: false, error: "config_error", missing }, { status: 500 });
    }

    const statusCount = await applyWhatsAppDeliveryStatuses(statuses);
    const jobIds = await enqueueWhatsAppInboundMessages(messages);
    for (const jobId of jobIds) {
      after(() => processWhatsAppInboundJob(jobId).catch((error) => {
        console.error("whatsapp_durable_job_after_failed", { jobId, reason: safeReason(error) });
      }));
    }

    await recordOperationalEvent({
      traceId,
      eventName: "whatsapp_webhook",
      stage: "durably_accepted",
      status: "ok",
      durationMs: performance.now() - startedAt,
      providerMessageId: messages[0]?.providerMessageId,
      metadata: { messageCount: messages.length, statusCount, jobCount: jobIds.length, releaseVersion: "11.2.0" }
    }).catch(() => false);

    return NextResponse.json({
      ok: true,
      accepted: true,
      queued: jobIds.length,
      statusesProcessed: statusCount,
      ignored: messages.length || statuses.length ? undefined : "unsupported_payload"
    }, { headers: { "X-LIMM-Trace-Id": traceId } });
  } catch (error) {
    const reason = safeReason(error);
    console.error("whatsapp_webhook_error", { stage: "durable_accept", code: "durable_accept_failed", reason });
    await recordOperationalEvent({ traceId, eventName: "whatsapp_webhook", stage: "durable_accept", status: "failed", durationMs: performance.now() - startedAt, errorCode: "durable_accept_failed" }).catch(() => false);
    return NextResponse.json({ ok: false, error: "webhook_error", code: "durable_accept_failed", reason }, { status: 500 });
  }
}
