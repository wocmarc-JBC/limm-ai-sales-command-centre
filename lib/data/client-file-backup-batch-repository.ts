import "server-only";

import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption
} from "@aws-sdk/client-s3";
import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";
import {
  getClientFileRecoveryRuntime,
  type ClientFileRecoveryRunResult
} from "@/lib/data/client-file-recovery-repository";

const DAILY_MANIFEST_RETENTION = 35;
const MONTHLY_MANIFEST_RETENTION = 12;
const BACKUP_BATCH_OBJECT_LIMIT = 12;
const BACKUP_BATCH_TIME_BUDGET_MS = 42_000;
const BACKUP_LEASE_SECONDS = 55;
const MAX_ITEM_ATTEMPTS = 3;
const ITEM_OPERATION_TIMEOUT_MS = 30_000;
const MANIFEST_PAGE_SIZE = 500;

type QueuedBackupItem = {
  id: string;
  lead_file_id: string | null;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  expected_size_bytes: number | string;
  observed_size_bytes: number | string | null;
  expected_sha256: string;
  observed_sha256: string;
  backup_object_key: string;
  status: string;
  error_code: string;
  source_uploaded_at: string;
  attempt_count: number | string;
};

type BackupRunClaim = {
  run_id: string;
  source_object_count: number | string;
  processed_object_count: number | string;
  copied_object_count: number | string;
  failed_object_count: number | string;
  batch_count: number | string;
  inventory_snapshot_at: string;
  metadata: Record<string, unknown> | null;
};

type BackupProgress = {
  pending_object_count: number | string;
  processed_object_count: number | string;
  copied_object_count: number | string;
  failed_object_count: number | string;
  copied_bytes: number | string;
  batch_count: number | string;
  metadata: Record<string, unknown> | null;
};

type BackupMode = "scheduled" | "continue";

export type ClientFileBackupBatchResult = {
  result: ClientFileRecoveryRunResult;
  continuationRequired: boolean;
  batchProcessedObjectCount: number;
  batchDurationMs: number;
};

function adminClient() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin credentials are required for resumable client-file backups.");
  return client;
}

function safeCount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function sha256(value: Uint8Array | Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeErrorCode(error: unknown) {
  const candidate = error && typeof error === "object" && "name" in error
    ? String((error as { name?: unknown }).name ?? "backup_item_failed")
    : "backup_item_failed";
  return candidate.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100) || "backup_item_failed";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorName: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error(errorName), { name: errorName })), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getS3Client() {
  const runtime = getClientFileRecoveryRuntime();
  if (!runtime.configured) throw new Error("Offsite S3-compatible backup target is not configured.");
  return new S3Client({
    endpoint: process.env.DR_S3_ENDPOINT!,
    region: process.env.DR_S3_REGION!,
    forcePathStyle: process.env.DR_S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: process.env.DR_S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.DR_S3_SECRET_ACCESS_KEY!
    }
  });
}

function encryptionOptions() {
  const requested = process.env.DR_S3_SERVER_SIDE_ENCRYPTION;
  const serverSideEncryption: ServerSideEncryption | undefined = requested === "AES256" || requested === "aws:kms"
    ? requested
    : undefined;
  return {
    ...(serverSideEncryption ? { ServerSideEncryption: serverSideEncryption } : {}),
    ...(serverSideEncryption === "aws:kms" && process.env.DR_S3_KMS_KEY_ID
      ? { SSEKMSKeyId: process.env.DR_S3_KMS_KEY_ID }
      : {})
  };
}

async function objectExists(client: S3Client, bucket: string, key: string) {
  try {
    await withTimeout(
      client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
      ITEM_OPERATION_TIMEOUT_MS,
      "backup_head_timeout"
    );
    return true;
  } catch (error) {
    const status = error && typeof error === "object" && "$metadata" in error
      ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? 0)
      : 0;
    if (status === 404 || safeErrorCode(error) === "NotFound") return false;
    throw error;
  }
}

async function putPrivateObject(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
  metadata: Record<string, string> = {}
) {
  await withTimeout(
    client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
      ...encryptionOptions()
    })),
    ITEM_OPERATION_TIMEOUT_MS,
    "backup_put_timeout"
  );
}

async function enforceManifestRetention(client: S3Client, bucket: string, prefix: string, keep: number) {
  const response = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  const objects = (response.Contents ?? [])
    .filter((item) => item.Key)
    .sort((a, b) => Number(b.LastModified ?? 0) - Number(a.LastModified ?? 0));
  for (const item of objects.slice(keep)) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.Key! }));
  }
  return Math.max(0, objects.length - keep);
}

async function downloadSourceItem(item: QueuedBackupItem) {
  const { data, error } = await withTimeout(
    adminClient().storage.from(item.storage_bucket).download(item.storage_path),
    ITEM_OPERATION_TIMEOUT_MS,
    "source_download_timeout"
  );
  if (error || !data) {
    throw Object.assign(new Error("Source storage object is missing or unreadable."), { name: "source_object_unavailable" });
  }
  return Buffer.from(await data.arrayBuffer());
}

function inspectSourceItem(item: QueuedBackupItem, bytes: Buffer) {
  const expectedSize = safeCount(item.expected_size_bytes);
  const expectedSha = String(item.expected_sha256 || "");
  const observedSha = sha256(bytes);
  const status = bytes.byteLength !== expectedSize
    ? "size_mismatch"
    : expectedSha && expectedSha !== observedSha
      ? "checksum_mismatch"
      : "verified";
  return { expectedSize, expectedSha, observedSha, status };
}

async function updateLeadFileIntegrity(item: QueuedBackupItem, status: string, observedSha = "") {
  if (!item.lead_file_id) return;
  const update: Record<string, unknown> = {
    integrity_status: status,
    integrity_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (status === "verified" && observedSha) update.content_sha256 = observedSha;
  await adminClient().from("lead_files").update(update).eq("id", item.lead_file_id);
}

async function checkpointItem(
  item: QueuedBackupItem,
  values: {
    observedSizeBytes: number | null;
    observedSha256: string;
    backupObjectKey: string;
    status: string;
    errorCode: string;
    attemptCount: number;
  }
) {
  const now = new Date().toISOString();
  const { error } = await adminClient()
    .from("client_file_recovery_items")
    .update({
      observed_size_bytes: values.observedSizeBytes,
      observed_sha256: values.observedSha256,
      backup_object_key: values.backupObjectKey,
      status: values.status,
      error_code: values.errorCode,
      attempt_count: values.attemptCount,
      last_attempt_at: now,
      checked_at: now
    })
    .eq("id", item.id)
    .eq("status", "pending");
  if (error) throw new Error(`Client-file backup item checkpoint failed: ${error.message}`);
}

async function heartbeatRun(runId: string, leaseToken: string) {
  const now = new Date();
  const { error } = await adminClient()
    .from("client_file_recovery_runs")
    .update({
      last_progress_at: now.toISOString(),
      lease_expires_at: new Date(now.getTime() + BACKUP_LEASE_SECONDS * 1000).toISOString()
    })
    .eq("id", runId)
    .eq("status", "running")
    .eq("lease_token", leaseToken);
  if (error) throw new Error(`Client-file backup heartbeat failed: ${error.message}`);
}

async function resolveRunId(mode: BackupMode, requestedRunId: string | null, destination: string) {
  if (mode === "continue") {
    if (!requestedRunId) return null;
    const { data, error } = await adminClient()
      .from("client_file_recovery_runs")
      .select("id")
      .eq("id", requestedRunId)
      .eq("run_type", "backup")
      .eq("status", "running")
      .maybeSingle();
    if (error) throw new Error(`Client-file backup continuation lookup failed: ${error.message}`);
    return data?.id ? String(data.id) : null;
  }

  const { data, error } = await adminClient().rpc("start_or_resume_client_file_backup", {
    p_destination: destination
  });
  if (error) throw new Error(`Client-file backup start failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return row?.run_id ? String(row.run_id) : null;
}

async function claimRun(runId: string, leaseToken: string) {
  const { data, error } = await adminClient().rpc("claim_client_file_backup_run", {
    p_run_id: runId,
    p_lease_token: leaseToken,
    p_lease_seconds: BACKUP_LEASE_SECONDS
  });
  if (error) throw new Error(`Client-file backup lease claim failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as BackupRunClaim | undefined;
  return row?.run_id ? row : null;
}

async function listPendingBatch(runId: string) {
  const { data, error } = await adminClient()
    .from("client_file_recovery_items")
    .select("id,lead_file_id,storage_bucket,storage_path,mime_type,expected_size_bytes,observed_size_bytes,expected_sha256,observed_sha256,backup_object_key,status,error_code,source_uploaded_at,attempt_count")
    .eq("run_id", runId)
    .eq("status", "pending")
    .order("source_uploaded_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(BACKUP_BATCH_OBJECT_LIMIT);
  if (error) throw new Error(`Client-file pending backup batch lookup failed: ${error.message}`);
  return (data ?? []) as QueuedBackupItem[];
}

async function refreshProgress(
  runId: string,
  leaseToken: string,
  batchDurationMs: number,
  batchProcessedObjectCount: number,
  newlyCopiedCount: number
) {
  const { data, error } = await adminClient().rpc("refresh_client_file_backup_progress", {
    p_run_id: runId,
    p_lease_token: leaseToken,
    p_batch_duration_ms: Math.max(0, Math.round(batchDurationMs)),
    p_batch_processed_count: batchProcessedObjectCount,
    p_newly_copied_count: newlyCopiedCount
  });
  if (error) throw new Error(`Client-file backup progress refresh failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as BackupProgress | undefined;
  if (!row) throw new Error("Client-file backup lease was lost before progress could be recorded.");
  return row;
}

async function listAllRunItems(runId: string) {
  const items: QueuedBackupItem[] = [];
  for (let from = 0; ; from += MANIFEST_PAGE_SIZE) {
    const { data, error } = await adminClient()
      .from("client_file_recovery_items")
      .select("id,lead_file_id,storage_bucket,storage_path,mime_type,expected_size_bytes,observed_size_bytes,expected_sha256,observed_sha256,backup_object_key,status,error_code,source_uploaded_at,attempt_count")
      .eq("run_id", runId)
      .order("source_uploaded_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + MANIFEST_PAGE_SIZE - 1);
    if (error) throw new Error(`Client-file backup manifest inventory lookup failed: ${error.message}`);
    const page = (data ?? []) as QueuedBackupItem[];
    items.push(...page);
    if (page.length < MANIFEST_PAGE_SIZE) break;
  }
  return items;
}

function buildManifest(runId: string, claim: BackupRunClaim, items: QueuedBackupItem[]) {
  return {
    schemaVersion: "limm-client-files-backup-manifest-v2",
    runId,
    inventorySnapshotAt: claim.inventory_snapshot_at,
    generatedAt: new Date().toISOString(),
    sourceObjectCount: safeCount(claim.source_object_count),
    processedObjectCount: items.filter((item) => item.status !== "pending").length,
    copiedObjectCount: items.filter((item) => item.status === "copied").length,
    failedObjectCount: items.filter((item) => ["missing", "size_mismatch", "checksum_mismatch", "error"].includes(item.status)).length,
    batchCount: safeCount(claim.batch_count) + 1,
    objects: items.map((item) => ({
      leadFileId: item.lead_file_id,
      sourceBucket: item.storage_bucket,
      sourcePath: item.storage_path,
      sourceUploadedAt: item.source_uploaded_at,
      mimeType: item.mime_type,
      expectedSizeBytes: safeCount(item.expected_size_bytes),
      observedSizeBytes: item.observed_size_bytes === null ? null : safeCount(item.observed_size_bytes),
      expectedSha256: item.expected_sha256,
      observedSha256: item.observed_sha256,
      backupObjectKey: item.backup_object_key,
      status: item.status,
      errorCode: item.error_code,
      attemptCount: safeCount(item.attempt_count)
    }))
  };
}

async function finalizeRun(
  runId: string,
  leaseToken: string,
  claim: BackupRunClaim,
  progress: BackupProgress,
  client: S3Client,
  bucket: string
): Promise<ClientFileRecoveryRunResult> {
  const items = await listAllRunItems(runId);
  const sourceObjectCount = safeCount(claim.source_object_count);
  const processedObjectCount = items.filter((item) => item.status !== "pending").length;
  const copiedObjectCount = items.filter((item) => item.status === "copied").length;
  const failedObjectCount = items.filter((item) => ["missing", "size_mismatch", "checksum_mismatch", "error"].includes(item.status)).length;
  const copiedBytes = items
    .filter((item) => item.status === "copied")
    .reduce((sum, item) => sum + safeCount(item.observed_size_bytes), 0);
  const sourceBytes = items.reduce((sum, item) => sum + safeCount(item.expected_size_bytes), 0);
  const fullCoverageProven =
    processedObjectCount === sourceObjectCount &&
    copiedObjectCount === sourceObjectCount &&
    failedObjectCount === 0;

  const manifest = buildManifest(runId, claim, items);
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const manifestSha256 = sha256(manifestBytes);
  const date = new Date().toISOString().slice(0, 10);
  const month = date.slice(0, 7);
  const manifestKey = `manifests/daily/${date}/${runId}.json`;
  await putPrivateObject(client, bucket, manifestKey, manifestBytes, "application/json", { sha256: manifestSha256 });

  const monthlyKey = `manifests/monthly/${month}/${runId}.json`;
  const existingMonthly = await client.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: `manifests/monthly/${month}/`,
    MaxKeys: 1
  }));
  if (!existingMonthly.Contents?.length) {
    await putPrivateObject(client, bucket, monthlyKey, manifestBytes, "application/json", { sha256: manifestSha256 });
  }

  const dailyDeleted = await enforceManifestRetention(client, bucket, "manifests/daily/", DAILY_MANIFEST_RETENTION);
  const monthlyDeleted = await enforceManifestRetention(client, bucket, "manifests/monthly/", MONTHLY_MANIFEST_RETENTION);
  const status = fullCoverageProven ? "succeeded" : "failed";
  const completedAt = new Date().toISOString();
  const metadata = {
    ...(progress.metadata ?? claim.metadata ?? {}),
    schemaVersion: "limm-client-file-backup-run-v2",
    fullInventoryQueued: true,
    fullInventoryProcessed: processedObjectCount === sourceObjectCount,
    fullCoverageProven,
    continuationRequired: false,
    contentAddressedObjects: true,
    dailyManifestsDeleted: dailyDeleted,
    monthlyManifestsDeleted: monthlyDeleted,
    completedAt
  };
  const { data, error } = await adminClient()
    .from("client_file_recovery_runs")
    .update({
      status,
      processed_object_count: processedObjectCount,
      verified_object_count: copiedObjectCount,
      copied_object_count: copiedObjectCount,
      failed_object_count: failedObjectCount,
      source_bytes: sourceBytes,
      copied_bytes: copiedBytes,
      manifest_key: manifestKey,
      manifest_sha256: manifestSha256,
      error_code: fullCoverageProven ? "" : "offsite_copy_failed",
      metadata,
      continuation_required: false,
      lease_token: null,
      lease_expires_at: null,
      last_progress_at: completedAt,
      completed_at: completedAt
    })
    .eq("id", runId)
    .eq("status", "running")
    .eq("lease_token", leaseToken)
    .select("id")
    .maybeSingle();
  if (error || !data?.id) throw new Error(`Client-file backup finalization failed: ${error?.message ?? "lease_lost"}`);

  return {
    runId,
    runType: "backup",
    status,
    sourceObjectCount,
    processedObjectCount,
    verifiedObjectCount: copiedObjectCount,
    copiedObjectCount,
    failedObjectCount,
    sourceBytes,
    copiedBytes,
    manifestKey,
    manifestSha256,
    errorCode: fullCoverageProven ? "" : "offsite_copy_failed"
  };
}

async function recordNotConfiguredRun(destination: string, missingConfigurationCount: number) {
  const completedAt = new Date().toISOString();
  const { data, error } = await adminClient()
    .from("client_file_recovery_runs")
    .insert({
      run_type: "backup",
      status: "not_configured",
      destination,
      error_code: "offsite_target_not_configured",
      metadata: { missingConfigurationCount },
      completed_at: completedAt,
      last_progress_at: completedAt,
      continuation_required: false
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`Client-file backup configuration evidence failed: ${error?.message ?? "missing_run_id"}`);
  return String(data.id);
}

export async function runClientFileOffsiteBackupBatch(input: {
  mode: BackupMode;
  requestedRunId?: string | null;
}): Promise<ClientFileBackupBatchResult | null> {
  const runtime = getClientFileRecoveryRuntime();
  if (!runtime.configured) {
    if (input.mode === "continue") return null;
    const runId = await recordNotConfiguredRun(runtime.destination, runtime.missing.length);
    return {
      continuationRequired: false,
      batchProcessedObjectCount: 0,
      batchDurationMs: 0,
      result: {
        runId,
        runType: "backup",
        status: "not_configured",
        sourceObjectCount: 0,
        processedObjectCount: 0,
        verifiedObjectCount: 0,
        copiedObjectCount: 0,
        failedObjectCount: 0,
        sourceBytes: 0,
        copiedBytes: 0,
        manifestKey: "",
        manifestSha256: "",
        errorCode: "offsite_target_not_configured"
      }
    };
  }

  const runId = await resolveRunId(input.mode, input.requestedRunId ?? null, runtime.destination);
  if (!runId) return null;
  const leaseToken = randomUUID();
  const claim = await claimRun(runId, leaseToken);
  if (!claim) return null;

  const batchStartedAt = Date.now();
  const client = getS3Client();
  const bucket = process.env.DR_S3_BUCKET!;
  const pendingItems = await listPendingBatch(runId);
  let batchProcessedObjectCount = 0;
  let newlyCopiedCount = 0;

  for (const item of pendingItems) {
    if (batchProcessedObjectCount > 0 && Date.now() - batchStartedAt >= BACKUP_BATCH_TIME_BUDGET_MS) break;
    const attemptCount = safeCount(item.attempt_count) + 1;
    try {
      const bytes = await downloadSourceItem(item);
      const inspection = inspectSourceItem(item, bytes);
      if (inspection.status !== "verified") {
        await checkpointItem(item, {
          observedSizeBytes: bytes.byteLength,
          observedSha256: inspection.observedSha,
          backupObjectKey: "",
          status: inspection.status,
          errorCode: inspection.status,
          attemptCount
        });
        await updateLeadFileIntegrity(item, inspection.status);
      } else {
        const objectKey = `objects/${inspection.observedSha.slice(0, 2)}/${inspection.observedSha}`;
        const exists = await objectExists(client, bucket, objectKey);
        if (!exists) {
          await putPrivateObject(client, bucket, objectKey, bytes, item.mime_type || "application/octet-stream", {
            sha256: inspection.observedSha,
            size: String(bytes.byteLength)
          });
          newlyCopiedCount += 1;
        }
        await checkpointItem(item, {
          observedSizeBytes: bytes.byteLength,
          observedSha256: inspection.observedSha,
          backupObjectKey: objectKey,
          status: "copied",
          errorCode: "",
          attemptCount
        });
        await updateLeadFileIntegrity(item, "verified", inspection.observedSha);
      }
    } catch (error) {
      const errorCode = safeErrorCode(error);
      const retryable = attemptCount < MAX_ITEM_ATTEMPTS;
      const terminalStatus = errorCode === "source_object_unavailable" ? "missing" : "error";
      await checkpointItem(item, {
        observedSizeBytes: null,
        observedSha256: "",
        backupObjectKey: "",
        status: retryable ? "pending" : terminalStatus,
        errorCode,
        attemptCount
      });
      if (!retryable) await updateLeadFileIntegrity(item, terminalStatus);
    }
    batchProcessedObjectCount += 1;
    await heartbeatRun(runId, leaseToken);
  }

  const batchDurationMs = Date.now() - batchStartedAt;
  const progress = await refreshProgress(
    runId,
    leaseToken,
    batchDurationMs,
    batchProcessedObjectCount,
    newlyCopiedCount
  );
  const pendingObjectCount = safeCount(progress.pending_object_count);

  if (pendingObjectCount > 0) {
    const sourceObjectCount = safeCount(claim.source_object_count);
    const copiedObjectCount = safeCount(progress.copied_object_count);
    return {
      continuationRequired: true,
      batchProcessedObjectCount,
      batchDurationMs,
      result: {
        runId,
        runType: "backup",
        status: "partial",
        sourceObjectCount,
        processedObjectCount: safeCount(progress.processed_object_count),
        verifiedObjectCount: copiedObjectCount,
        copiedObjectCount,
        failedObjectCount: safeCount(progress.failed_object_count),
        sourceBytes: 0,
        copiedBytes: safeCount(progress.copied_bytes),
        manifestKey: "",
        manifestSha256: "",
        errorCode: "continuation_required"
      }
    };
  }

  const result = await finalizeRun(runId, leaseToken, claim, progress, client, bucket);
  return {
    result,
    continuationRequired: false,
    batchProcessedObjectCount,
    batchDurationMs
  };
}
