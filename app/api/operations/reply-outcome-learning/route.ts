import { NextResponse } from "next/server";
import { authorizeReliabilityScheduler } from "@/lib/reliability-scheduler-auth";
import { processAiReplyOutcomes } from "@/lib/ai-reply-outcome-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const scheduler = await authorizeReliabilityScheduler(request);
  if (!scheduler) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 100), 250));
  try {
    const result = await processAiReplyOutcomes(limit);
    return NextResponse.json({
      ok: result.failed === 0,
      scheduler,
      version: "v11.4.7",
      ...result,
      clientMessagesSent: 0
    }, {
      status: result.failed === 0 ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: "reply_outcome_learning_failed",
      errorCode: error instanceof Error ? error.name : "unknown",
      clientMessagesSent: 0
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
