import { NextResponse } from "next/server";
import { runReliabilityWatchdog } from "@/lib/data/reliability-incidents-repository";
import { authorizeReliabilityScheduler } from "@/lib/reliability-scheduler-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const scheduler = await authorizeReliabilityScheduler(request);
  if (!scheduler) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const result = await runReliabilityWatchdog();
    return NextResponse.json({
      ok: true,
      scheduler,
      ready: result.ready,
      evaluatedAt: result.evaluatedAt,
      activeIncidents: result.activeCount,
      criticalIncidents: result.criticalCount,
      warningIncidents: result.warningCount,
      openedIncidents: result.openedCount,
      resolvedIncidents: result.resolvedCount,
      alertDelivery: result.alert.status,
      clientMessagesSent: 0
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      ok: false,
      scheduler,
      error: "reliability_watchdog_failed",
      clientMessagesSent: 0
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
