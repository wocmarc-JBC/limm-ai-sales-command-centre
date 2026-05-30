import { NextRequest, NextResponse } from "next/server";
import { handleWhatsAppInboundMessage } from "@/lib/whatsapp-auto-reply";
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

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    console.error("whatsapp_webhook_error", { stage: "json_parse", reason: "Invalid JSON payload." });
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  console.info("whatsapp_webhook_received", {
    objectType: typeof payload === "object" && payload !== null ? "object" : typeof payload
  });

  const messages = parseWhatsAppInbound(payload);
  console.info("whatsapp_payload_parsed", { messageCount: messages.length });
  if (!messages.length) {
    return NextResponse.json({ ok: true, ignored: true, reason: "No supported WhatsApp message found." });
  }

  const results = [];
  for (const message of messages) {
    try {
      results.push(await handleWhatsAppInboundMessage(message));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown WhatsApp webhook failure.";
      console.error("whatsapp_webhook_error", {
        stage: "message_processing",
        providerMessageId: message.providerMessageId,
        reason
      });
      return NextResponse.json(
        {
          ok: false,
          providerMessageId: message.providerMessageId,
          error: reason
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, results });
}
