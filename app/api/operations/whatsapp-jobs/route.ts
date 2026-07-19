import { NextResponse } from "next/server";
import { drainWhatsAppInboundJobs } from "@/lib/whatsapp-inbound-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const results = await drainWhatsAppInboundJobs(20);
  return NextResponse.json({ ok: true, processed: results.length, results }, { headers: { "Cache-Control": "no-store" } });
}
