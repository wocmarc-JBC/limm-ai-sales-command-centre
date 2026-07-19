import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/data/audit-repository";
import {
  recordDatabaseRecoveryEvidence,
  type DatabaseRecoveryEvidenceInput
} from "@/lib/data/database-recovery-repository";
import { authorizeReliabilityEvidence } from "@/lib/reliability-evidence-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function boundedNumber(value: unknown, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : Number.NaN;
}

function parseEvidence(payload: Record<string, unknown>): DatabaseRecoveryEvidenceInput | null {
  const runType = payload.runType === "backup" || payload.runType === "restore_drill" ? payload.runType : null;
  const status = payload.status === "succeeded" || payload.status === "failed" ? payload.status : null;
  const externalRunId = text(payload.externalRunId, 160);
  const provider = text(payload.provider, 100) || "independent_pg_dump";
  const artifactSha256 = text(payload.artifactSha256, 128);
  const artifactSizeBytes = boundedNumber(payload.artifactSizeBytes, 10 * 1024 * 1024 * 1024 * 1024);
  const schemaChecksPassed = boundedNumber(payload.schemaChecksPassed, 10_000);
  const rowChecksPassed = boundedNumber(payload.rowChecksPassed, 10_000);
  const startedAt = text(payload.startedAt, 40);
  const completedAt = text(payload.completedAt, 40);
  if (!runType || !status || !/^[a-zA-Z0-9_.:@/-]{3,160}$/.test(externalRunId)) return null;
  if (!Number.isFinite(artifactSizeBytes) || !Number.isFinite(schemaChecksPassed) || !Number.isFinite(rowChecksPassed)) return null;
  if (!startedAt || !completedAt) return null;
  return {
    externalRunId,
    runType,
    status,
    provider,
    artifactSha256,
    artifactSizeBytes,
    sourceBackupExternalRunId: text(payload.sourceBackupExternalRunId, 160) || undefined,
    isolatedRestore: payload.isolatedRestore === true,
    schemaChecksPassed,
    rowChecksPassed,
    errorCode: text(payload.errorCode, 100),
    startedAt,
    completedAt,
    metadata: {
      workflowRunId: text(payload.workflowRunId, 100),
      workflowRunAttempt: boundedNumber(payload.workflowRunAttempt, 1000) || 0,
      repository: text(payload.repository, 160),
      commitSha: text(payload.commitSha, 64),
      encrypted: payload.encrypted === true,
      compression: text(payload.compression, 40)
    }
  };
}

export async function POST(request: Request) {
  if (!authorizeReliabilityEvidence(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 16_384) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const evidence = parseEvidence(payload);
  if (!evidence) return NextResponse.json({ ok: false, error: "invalid_evidence" }, { status: 400 });
  try {
    const result = await recordDatabaseRecoveryEvidence(evidence);
    await createAuditLog({
      actorType: "system",
      actorName: "Database recovery workflow",
      action: "database_recovery_evidence_recorded",
      entityType: "database_recovery_run",
      entityId: result.id,
      summary: `${evidence.runType === "backup" ? "Encrypted database backup" : "Isolated database restore drill"} evidence recorded with status ${evidence.status}.`,
      metadata: {
        runType: evidence.runType,
        status: evidence.status,
        isolatedRestore: evidence.isolatedRestore,
        checksumRecorded: Boolean(evidence.artifactSha256),
        artifactSizeRecorded: evidence.artifactSizeBytes > 0
      }
    });
    return NextResponse.json({
      ok: true,
      evidenceId: result.id,
      runType: result.runType,
      recoverySucceeded: result.status === "succeeded",
      completedAt: result.completedAt
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error && /^[a-z_]+$/.test(error.message)
      ? error.message
      : "evidence_persistence_failed";
    return NextResponse.json({ ok: false, error: code }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
