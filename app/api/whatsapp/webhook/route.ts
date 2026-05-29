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
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const messages = parseWhatsAppInbound(payload);
  if (!messages.length) {
    return NextResponse.json({ ok: true, ignored: true, reason: "No supported WhatsApp message found." });
  }

  const results = [];
  for (const message of messages) {
    try {
      results.push(await handleWhatsAppInboundMessage(message));
    } catch (error) {
      results.push({
        providerMessageId: message.providerMessageId,
        status: "auto_reply_failed",
        reason: error instanceof Error ? error.message : "Unknown WhatsApp webhook failure."
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
