import { NextRequest, NextResponse } from "next/server";
import { handleWhatsAppInboundMessage } from "@/lib/whatsapp-auto-reply";
import { getWhatsAppRuntime } from "@/lib/whatsapp-config";
import { parseWhatsAppInbound } from "@/lib/whatsapp-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const mode = search.get("hub.mode");
  const token = search.get("hub.verify_token");
  const challenge = search.get("hub.challenge") ?? "";
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && expectedToken && token === expectedToken) {
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
  if (envMissing("NEXT_PUBLIC_SUPABASE_ANON_KEY")) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (envMissing("SUPABASE_SERVICE_ROLE_KEY")) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (envMissing("WHATSAPP_VERIFY_TOKEN")) missing.push("WHATSAPP_VERIFY_TOKEN");
  if (!runtime.liveInboundEnabled) missing.push("WHATSAPP_LIVE_INBOUND_ENABLED=true");
  if (runtime.publicAutoReplyEnabled) missing.push("WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false");
  if (!runtime.testMode) missing.push("WHATSAPP_TEST_MODE=true");

  if (runtime.testAutoReplyEnabled) {
    if (envMissing("WHATSAPP_PHONE_NUMBER_ID")) missing.push("WHATSAPP_PHONE_NUMBER_ID");
    if (envMissing("WHATSAPP_ACCESS_TOKEN")) missing.push("WHATSAPP_ACCESS_TOKEN");
    if (envMissing("WHATSAPP_BUSINESS_NUMBER")) missing.push("WHATSAPP_BUSINESS_NUMBER");
  }

  return { runtime, missing };
}

function safeReason(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown WhatsApp webhook failure.";
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/(access_token=)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .slice(0, 260);
}

function hasStatusOnlyPayload(payload: any) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  return entries.some((entry: any) =>
    (Array.isArray(entry?.changes) ? entry.changes : []).some((change: any) => Array.isArray(change?.value?.statuses))
  );
}

function autoReplyResponseFromResult(result: Awaited<ReturnType<typeof handleWhatsAppInboundMessage>>) {
  if (result.status === "ignored_duplicate") {
    return { ok: true, ignored: "duplicate_message", leadId: result.leadId };
  }
  if (result.status === "auto_reply_sent") {
    return { ok: true, autoReply: "sent", leadId: result.leadId };
  }
  if (result.status === "auto_reply_blocked") {
    return { ok: true, autoReply: "blocked_unsafe", leadId: result.leadId };
  }
  if (result.status === "auto_reply_failed") {
    return { ok: true, autoReply: "send_failed_logged", leadId: result.leadId };
  }
  if (result.status === "auto_reply_disabled" || result.status === "saved_inbound") {
    return { ok: true, autoReply: "disabled", leadId: result.leadId };
  }
  return { ok: true, ignored: result.status, leadId: result.leadId };
}

export async function POST(request: NextRequest) {
  console.info("whatsapp_webhook_received_start");
  try {
    console.info("whatsapp_body_read_started");
    const rawBody = await request.text();
    console.info("whatsapp_body_read_ok", { byteLength: rawBody.length });

    let payload: unknown;
    try {
      console.info("whatsapp_payload_parse_started");
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      console.error("whatsapp_webhook_error", { stage: "payload_parse", code: "payload_parse_failed" });
      return NextResponse.json({ ok: false, error: "payload_parse_failed" }, { status: 400 });
    }

    const messages = parseWhatsAppInbound(payload);
    console.info("whatsapp_payload_parsed", {
      messageCount: messages.length,
      statusOnly: hasStatusOnlyPayload(payload)
    });

    if (!messages.length) {
      console.info("whatsapp_unsupported_payload", { statusOnly: hasStatusOnlyPayload(payload) });
      return NextResponse.json({ ok: true, ignored: "unsupported_or_status_payload" });
    }

    const { runtime: whatsappRuntime, missing } = getMissingWebhookConfig();
    console.info("whatsapp_config_checked", {
      liveInboundEnabled: whatsappRuntime.liveInboundEnabled,
      testAutoReplyEnabled: whatsappRuntime.testAutoReplyEnabled,
      publicAutoReplyEnabled: whatsappRuntime.publicAutoReplyEnabled,
      testMode: whatsappRuntime.testMode,
      hasSupabaseUrl: !envMissing("NEXT_PUBLIC_SUPABASE_URL"),
      hasSupabaseAnonKey: !envMissing("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      hasServiceRoleKey: !envMissing("SUPABASE_SERVICE_ROLE_KEY"),
      hasWhatsappVerifyToken: !envMissing("WHATSAPP_VERIFY_TOKEN"),
      hasWhatsappPhoneNumberId: !envMissing("WHATSAPP_PHONE_NUMBER_ID"),
      hasWhatsappAccessToken: !envMissing("WHATSAPP_ACCESS_TOKEN"),
      hasWhatsappBusinessNumber: !envMissing("WHATSAPP_BUSINESS_NUMBER")
    });
    console.info("whatsapp_auto_reply_enabled_state", {
      liveInboundEnabled: whatsappRuntime.liveInboundEnabled,
      testAutoReplyEnabled: whatsappRuntime.testAutoReplyEnabled,
      publicAutoReplyEnabled: whatsappRuntime.publicAutoReplyEnabled,
      testMode: whatsappRuntime.testMode
    });

    if (missing.length) {
      console.error("whatsapp_webhook_error", { stage: "config_check", code: "config_error", missing });
      return NextResponse.json({ ok: false, error: "config_error", missing }, { status: 500 });
    }

    const results = [];
    for (const message of messages) {
      try {
        const result = await handleWhatsAppInboundMessage(message);
        results.push(result);
      } catch (error) {
        const reason = safeReason(error);
        console.error("whatsapp_webhook_error", {
          stage: "message_processing",
          code: "message_processing_failed",
          providerMessageId: message.providerMessageId,
          reason
        });
        return NextResponse.json(
          {
            ok: false,
            error: "webhook_error",
            code: "message_processing_failed",
            providerMessageId: message.providerMessageId,
            reason
          },
          { status: 500 }
        );
      }
    }

    const first = results[0];
    if (results.length === 1 && first) {
      return NextResponse.json(autoReplyResponseFromResult(first));
    }

    return NextResponse.json({
      ok: true,
      results: results.map((result) => ({
        providerMessageId: result.providerMessageId,
        leadId: result.leadId,
        status: result.status,
        reason: result.reason
      }))
    });
  } catch (error) {
    const reason = safeReason(error);
    console.error("whatsapp_webhook_error", {
      stage: "top_level",
      code: "top_level_webhook_failure",
      reason
    });
    return NextResponse.json(
      {
        ok: false,
        error: "webhook_error",
        code: "top_level_webhook_failure",
        reason
      },
      { status: 500 }
    );
  }
}
