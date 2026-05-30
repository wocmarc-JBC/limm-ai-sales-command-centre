import { NextRequest, NextResponse } from "next/server";
import { parseWhatsAppInbound } from "@/lib/whatsapp-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function debugEndpointEnabled() {
  return process.env.WHATSAPP_TEST_MODE === "true" || process.env.WHATSAPP_DEBUG_ENDPOINT_ENABLED === "true";
}

function hasStatuses(payload: any) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  return entries.some((entry: any) =>
    (Array.isArray(entry?.changes) ? entry.changes : []).some((change: any) => Array.isArray(change?.value?.statuses))
  );
}

export async function POST(request: NextRequest) {
  if (!debugEndpointEnabled()) {
    return NextResponse.json({ ok: false, error: "debug_endpoint_disabled" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        textFound: false,
        senderFound: false,
        providerMessageIdFound: false,
        messageType: "unknown",
        error: "payload_parse_failed"
      },
      { status: 400 }
    );
  }

  try {
    const messages = parseWhatsAppInbound(payload);
    const first = messages[0];
    const messageType = first ? (first.type === "text" ? "text" : first.type || "unsupported") : hasStatuses(payload) ? "status" : "unsupported";

    return NextResponse.json({
      ok: true,
      textFound: Boolean(first?.text),
      senderFound: Boolean(first?.senderPhone),
      providerMessageIdFound: Boolean(first?.providerMessageId),
      messageType
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        textFound: false,
        senderFound: false,
        providerMessageIdFound: false,
        messageType: "unknown",
        error: "payload_parse_failed"
      },
      { status: 400 }
    );
  }
}
