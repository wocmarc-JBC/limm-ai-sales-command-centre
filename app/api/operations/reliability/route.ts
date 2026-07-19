import { after, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/data/audit-repository";
import {
  getClientFileRecoverySnapshot,
  runClientFileIntegrityAudit,
  runClientFileOffsiteBackup,
  runClientFileRestoreDrill
} from "@/lib/data/client-file-recovery-repository";
import {
  getWhatsAppQueueHealth,
  listWhatsAppDeadLetters,
  requeueWhatsAppDeadLetter
} from "@/lib/data/whatsapp-inbound-jobs-repository";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/operations/rate-limit";
import { processWhatsAppInboundJob } from "@/lib/whatsapp-inbound-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireOperator() {
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) return { ok: false as const, status: 401, error: "unauthorized" };
  if (!(["boss", "admin"] as string[]).includes(auth.profile.role)) {
    return { ok: false as const, status: 403, error: "operations_access_required" };
  }
  return { ok: true as const, actor: auth.profile };
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function GET() {
  const access = await requireOperator();
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  const rate = await consumeRateLimit({ identity: access.actor.id, action: "reliability_read", limit: 30, windowSeconds: 60 });
  if (!rate.allowed) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(rate) });

  try {
    const [queue, files, deadLetters] = await Promise.all([
      getWhatsAppQueueHealth(),
      getClientFileRecoverySnapshot(),
      access.actor.role === "boss" ? listWhatsAppDeadLetters() : Promise.resolve([])
    ]);
    return NextResponse.json({ ok: queue.available && files.available, queue, files, deadLetters }, {
      status: queue.available && files.available ? 200 : 503,
      headers: { ...rateLimitHeaders(rate), "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json({ ok: false, error: "reliability_snapshot_failed" }, {
      status: 503,
      headers: { ...rateLimitHeaders(rate), "Cache-Control": "no-store" }
    });
  }
}

export async function POST(request: Request) {
  const access = await requireOperator();
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  const rate = await consumeRateLimit({ identity: access.actor.id, action: "reliability_write", limit: 6, windowSeconds: 60 });
  if (!rate.allowed) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(rate) });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400, headers: rateLimitHeaders(rate) });
  }
  const action = typeof payload.action === "string" ? payload.action : "";

  try {
  if (action === "requeue_job") {
    if (access.actor.role !== "boss") return NextResponse.json({ ok: false, error: "boss_access_required" }, { status: 403, headers: rateLimitHeaders(rate) });
    const jobId = typeof payload.jobId === "string" ? payload.jobId : "";
    if (!UUID_PATTERN.test(jobId)) return NextResponse.json({ ok: false, error: "invalid_job_id" }, { status: 400, headers: rateLimitHeaders(rate) });
    const requeued = await requeueWhatsAppDeadLetter(jobId);
    if (!requeued) return NextResponse.json({ ok: false, error: "dead_letter_not_found" }, { status: 404, headers: rateLimitHeaders(rate) });
    await createAuditLog({
      actorType: access.actor.role,
      actorName: access.actor.fullName,
      actorEmail: access.actor.email,
      actorId: access.actor.id,
      action: "whatsapp_dead_letter_requeued",
      entityType: "whatsapp_inbound_job",
      entityId: jobId,
      summary: "Boss requeued a terminal durable inbound job through the existing idempotent WhatsApp handler.",
      metadata: { automaticClientSendNotForced: true, duplicateProviderMessageGuardRequired: true }
    });
    after(() => processWhatsAppInboundJob(jobId).catch(() => undefined));
    return NextResponse.json({ ok: true, jobId, status: "requeued" }, { headers: { ...rateLimitHeaders(rate), "Cache-Control": "no-store" } });
  }

  if (action === "run_integrity") {
    const result = await runClientFileIntegrityAudit();
    await createAuditLog({
      actorType: access.actor.role,
      actorName: access.actor.fullName,
      actorEmail: access.actor.email,
      actorId: access.actor.id,
      action: "client_file_integrity_audit_run",
      entityType: "client_file_recovery_run",
      entityId: result.runId,
      summary: `Client-file integrity audit finished with status ${result.status}.`,
      metadata: { processedObjects: result.processedObjectCount, verifiedObjects: result.verifiedObjectCount, failedObjects: result.failedObjectCount }
    });
    return NextResponse.json({ ok: result.status === "succeeded" || result.status === "partial", result }, { status: result.status === "failed" ? 503 : 200, headers: { ...rateLimitHeaders(rate), "Cache-Control": "no-store" } });
  }

  if (action === "run_backup" || action === "run_restore_drill") {
    if (access.actor.role !== "boss") return NextResponse.json({ ok: false, error: "boss_access_required" }, { status: 403, headers: rateLimitHeaders(rate) });
    const result = action === "run_backup" ? await runClientFileOffsiteBackup() : await runClientFileRestoreDrill();
    await createAuditLog({
      actorType: access.actor.role,
      actorName: access.actor.fullName,
      actorEmail: access.actor.email,
      actorId: access.actor.id,
      action: action === "run_backup" ? "client_file_offsite_backup_run" : "client_file_restore_drill_run",
      entityType: "client_file_recovery_run",
      entityId: result.runId,
      summary: `${action === "run_backup" ? "Offsite client-file backup" : "Client-file restore drill"} finished with status ${result.status}.`,
      metadata: { processedObjects: result.processedObjectCount, copiedObjects: result.copiedObjectCount, failedObjects: result.failedObjectCount, manifestRecorded: Boolean(result.manifestSha256) }
    });
    const ok = result.status === "succeeded" || result.status === "partial";
    return NextResponse.json({ ok, result }, { status: ok ? 200 : 503, headers: { ...rateLimitHeaders(rate), "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400, headers: rateLimitHeaders(rate) });
  } catch {
    return NextResponse.json({ ok: false, error: "reliability_operation_failed" }, {
      status: 503,
      headers: { ...rateLimitHeaders(rate), "Cache-Control": "no-store" }
    });
  }
}
