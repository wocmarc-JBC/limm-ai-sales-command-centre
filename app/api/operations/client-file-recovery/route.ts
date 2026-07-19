import { NextResponse } from "next/server";
import {
  runClientFileIntegrityAudit,
  runClientFileOffsiteBackup,
  runClientFileRestoreDrill
} from "@/lib/data/client-file-recovery-repository";
import { authorizeReliabilityScheduler } from "@/lib/reliability-scheduler-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const scheduler = await authorizeReliabilityScheduler(request);
  if (!scheduler) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const task = new URL(request.url).searchParams.get("task") || "integrity";
  try {
    const result = task === "backup"
      ? await runClientFileOffsiteBackup()
      : task === "restore_drill"
        ? await runClientFileRestoreDrill()
        : task === "integrity"
          ? await runClientFileIntegrityAudit()
          : null;
    if (!result) return NextResponse.json({ ok: false, error: "unknown_task" }, { status: 400 });

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
      errorCode: result.errorCode
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
