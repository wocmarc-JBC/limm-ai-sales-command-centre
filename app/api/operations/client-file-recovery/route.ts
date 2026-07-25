import { NextResponse } from "next/server";
import {
  runClientFileIntegrityAudit,
  runClientFileRestoreDrill
} from "@/lib/data/client-file-recovery-repository";
import { runClientFileOffsiteBackupBatch } from "@/lib/data/client-file-backup-batch-repository";
import {
  closeAbandonedClientFileRecoveryRuns,
  type ClientFileRecoveryTask
} from "@/lib/data/client-file-recovery-runtime-guard";
import { authorizeReliabilityScheduler } from "@/lib/reliability-scheduler-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const scheduler = await authorizeReliabilityScheduler(request);
  if (!scheduler) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const requestedTask = url.searchParams.get("task") || "integrity";
  const task: ClientFileRecoveryTask | null = requestedTask === "backup"
    || requestedTask === "restore_drill"
    || requestedTask === "integrity"
    ? requestedTask
    : null;
  if (!task) return NextResponse.json({ ok: false, error: "unknown_task" }, { status: 400 });

  try {
    const abandonedRunsClosed = await closeAbandonedClientFileRecoveryRuns(task);
    if (task === "backup") {
      const mode = url.searchParams.get("mode") === "continue" ? "continue" : "scheduled";
      const requestedRunId = url.searchParams.get("run_id");
      const batch = await runClientFileOffsiteBackupBatch({ mode, requestedRunId });
      if (!batch) {
        return NextResponse.json({
          ok: true,
          scheduler,
          task,
          status: "idle",
          continuationRequired: false,
          abandonedRunsClosed
        }, { status: 200, headers: { "Cache-Control": "no-store" } });
      }

      const result = batch.result;
      const ok = result.status === "succeeded" || result.status === "partial";
      return NextResponse.json({
        ok,
        scheduler,
        runId: result.runId,
        task: result.runType,
        status: result.status,
        sourceObjects: result.sourceObjectCount,
        processedObjects: result.processedObjectCount,
        verifiedObjects: result.verifiedObjectCount,
        copiedObjects: result.copiedObjectCount,
        failedObjects: result.failedObjectCount,
        manifestRecorded: Boolean(result.manifestSha256),
        errorCode: result.errorCode,
        continuationRequired: batch.continuationRequired,
        batchProcessedObjects: batch.batchProcessedObjectCount,
        batchDurationMs: batch.batchDurationMs,
        abandonedRunsClosed
      }, {
        status: ok ? 200 : 503,
        headers: { "Cache-Control": "no-store" }
      });
    }

    const result = task === "restore_drill"
      ? await runClientFileRestoreDrill()
      : await runClientFileIntegrityAudit();
    const ok = result.status === "succeeded" || result.status === "partial";
    return NextResponse.json({
      ok,
      scheduler,
      runId: result.runId,
      task: result.runType,
      status: result.status,
      sourceObjects: result.sourceObjectCount,
      processedObjects: result.processedObjectCount,
      verifiedObjects: result.verifiedObjectCount,
      copiedObjects: result.copiedObjectCount,
      failedObjects: result.failedObjectCount,
      manifestRecorded: Boolean(result.manifestSha256),
      errorCode: result.errorCode,
      continuationRequired: false,
      abandonedRunsClosed
    }, {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json({
      ok: false,
      scheduler,
      task,
      error: "recovery_operation_failed"
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
