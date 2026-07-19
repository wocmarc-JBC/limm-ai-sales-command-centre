import { NextResponse } from "next/server";
import { drainWhatsAppInboundJobs } from "@/lib/whatsapp-inbound-worker";
import {
  getWhatsAppQueueHealth,
  recordWhatsAppWorkerHeartbeat,
} from "@/lib/data/whatsapp-inbound-jobs-repository";
import { authorizeReliabilityScheduler } from "@/lib/reliability-scheduler-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const scheduler = await authorizeReliabilityScheduler(request);
  if (!scheduler) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const startedAt = new Date().toISOString();
  const started = performance.now();
  await recordWhatsAppWorkerHeartbeat({ status: "running", startedAt }).catch(() => false);
  try {
    const results = await drainWhatsAppInboundJobs(scheduler === "supabase_cron" ? 10 : 20);
    const retried = results.filter((result) => result.status === "retry_scheduled").length;
    const deadLettered = results.filter((result) => result.status === "dead_lettered").length;
    const status = retried || deadLettered ? "degraded" as const : "healthy" as const;
    await recordWhatsAppWorkerHeartbeat({
      status,
      startedAt,
      durationMs: performance.now() - started,
      metadata: {
        scheduler,
        processedCount: results.length,
        retryScheduledCount: retried,
        deadLetteredCount: deadLettered,
        releaseVersion: "11.3.0"
      }
    });
    const queue = await getWhatsAppQueueHealth();
    return NextResponse.json({
      ok: deadLettered === 0,
      scheduler,
      processed: results.length,
      retryScheduled: retried,
      deadLettered,
      queue: {
        queued: queue.queuedCount,
        processing: queue.processingCount,
        staleProcessing: queue.staleProcessingCount,
        deadLetters: queue.deadLetterCount
      }
    }, {
      status: deadLettered === 0 ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    await recordWhatsAppWorkerHeartbeat({
      status: "failed",
      startedAt,
      durationMs: performance.now() - started,
      metadata: { scheduler, errorCode: error instanceof Error ? error.name : "worker_failed", releaseVersion: "11.3.0" }
    }).catch(() => false);
    return NextResponse.json({ ok: false, error: "worker_failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
