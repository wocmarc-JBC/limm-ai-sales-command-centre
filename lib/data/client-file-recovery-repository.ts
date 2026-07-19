import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type ServerSideEncryption
} from "@aws-sdk/client-s3";
import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";

const DAILY_MANIFEST_RETENTION = 35;
const MONTHLY_MANIFEST_RETENTION = 12;
const DEFAULT_OBJECT_LIMIT = 100;
const MAX_OBJECT_LIMIT = 500;

type RecoveryRunType = "integrity" | "backup" | "restore_drill";
type RecoveryRunStatus = "running" | "succeeded" | "partial" | "failed" | "not_configured";
type RecoveryItemStatus = "verified" | "copied" | "missing" | "size_mismatch" | "checksum_mismatch" | "error" | "skipped";

type LeadFileRecoveryRow = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number | string;
  content_sha256: string;
};

type RecoveryItem = {
  leadFileId: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  expectedSizeBytes: number;
  observedSizeBytes: number | null;
  expectedSha256: string;
  observedSha256: string;
  backupObjectKey: string;
  status: RecoveryItemStatus;
  errorCode: string;
};

export type ClientFileRecoverySnapshot = {
  available: boolean;
  offsiteConfigured: boolean;
  destination: string;
  restoreBucketIsolated: boolean;
  latestIntegrityAt: string | null;
  latestIntegrityStatus: string;
  latestBackupAt: string | null;
  latestBackupStatus: string;
  latestRestoreDrillAt: string | null;
  latestRestoreDrillStatus: string;
  protectedObjectCount: number;
  failedObjectCount: number;
  manifestSha256: string;
};

export type ClientFileRecoveryRunResult = {
  runId: string;
  runType: RecoveryRunType;
  status: RecoveryRunStatus;
  sourceObjectCount: number;
  processedObjectCount: number;
  verifiedObjectCount: number;
  copiedObjectCount: number;
  failedObjectCount: number;
  sourceBytes: number;
  copiedBytes: number;
  manifestKey: string;
  manifestSha256: string;
  errorCode: string;
};

function adminClient() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin credentials are required for client-file recovery operations.");
  return client;
}

function safeCount(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function sha256(bytes: Uint8Array | Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeErrorCode(error: unknown) {
  const candidate = error && typeof error === "object" && "name" in error ? String(error.name) : "recovery_operation_failed";
  return candidate.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 100) || "recovery_operation_failed";
}

function destinationLabel() {
  try {
    const host = new URL(process.env.DR_S3_ENDPOINT || "").hostname;
    return host ? `s3:${host}` : "s3-compatible";
  } catch {
    return "s3-compatible";
  }
}

export function getClientFileRecoveryRuntime() {
  const required = [
    "DR_S3_ENDPOINT",
    "DR_S3_REGION",
    "DR_S3_BUCKET",
    "DR_S3_ACCESS_KEY_ID",
    "DR_S3_SECRET_ACCESS_KEY"
  ];
  const missing = required.filter((name) => !process.env[name]);
  return {
    configured: missing.length === 0,
    missing,
    destination: destinationLabel(),
    bucketConfigured: Boolean(process.env.DR_S3_BUCKET),
    restoreBucketIsolated: Boolean(
      process.env.DR_S3_RESTORE_BUCKET &&
      process.env.DR_S3_RESTORE_BUCKET !== process.env.DR_S3_BUCKET
    ),
    dailyManifestRetention: DAILY_MANIFEST_RETENTION,
    monthlyManifestRetention: MONTHLY_MANIFEST_RETENTION
  };
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

async function createRun(runType: RecoveryRunType, destination: string) {
  const { data, error } = await adminClient()
    .from("client_file_recovery_runs")
    .insert({ run_type: runType, status: "running", destination })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`Client-file recovery run creation failed: ${error?.message ?? "missing_run_id"}`);
  return String(data.id);
}

async function finishRun(runId: string, result: Omit<ClientFileRecoveryRunResult, "runId" | "runType">, metadata: Record<string, unknown> = {}) {
  const { error } = await adminClient().from("client_file_recovery_runs").update({
    status: result.status,
    source_object_count: result.sourceObjectCount,
    processed_object_count: result.processedObjectCount,
    verified_object_count: result.verifiedObjectCount,
    copied_object_count: result.copiedObjectCount,
    failed_object_count: result.failedObjectCount,
    source_bytes: result.sourceBytes,
    copied_bytes: result.copiedBytes,
    manifest_key: result.manifestKey,
    manifest_sha256: result.manifestSha256,
    error_code: result.errorCode,
    metadata,
    completed_at: new Date().toISOString()
  }).eq("id", runId);
  if (error) throw new Error(`Client-file recovery run completion failed: ${error.message}`);
}

async function insertItems(runId: string, items: RecoveryItem[]) {
  if (!items.length) return;
  const rows = items.map((item) => ({
    run_id: runId,
    lead_file_id: item.leadFileId,
    storage_bucket: item.storageBucket,
    storage_path: item.storagePath,
    mime_type: item.mimeType,
    expected_size_bytes: item.expectedSizeBytes,
    observed_size_bytes: item.observedSizeBytes,
    expected_sha256: item.expectedSha256,
    observed_sha256: item.observedSha256,
    backup_object_key: item.backupObjectKey,
    status: item.status,
    error_code: item.errorCode
  }));
  for (let index = 0; index < rows.length; index += 100) {
    const { error } = await adminClient().from("client_file_recovery_items").insert(rows.slice(index, index + 100));
    if (error) throw new Error(`Client-file recovery item persistence failed: ${error.message}`);
  }
}

async function listSourceFiles(limit: number) {
  const normalizedLimit = Math.max(1, Math.min(limit, MAX_OBJECT_LIMIT));
  const { data, error, count } = await adminClient()
    .from("lead_files")
    .select("id,storage_bucket,storage_path,mime_type,file_size_bytes,content_sha256", { count: "exact" })
    .neq("file_status", "voided")
    .gt("file_size_bytes", 0)
    .order("uploaded_at", { ascending: true })
    .limit(normalizedLimit);
  if (error) throw new Error(`Client-file source inventory failed: ${error.message}`);
  return { rows: (data ?? []) as LeadFileRecoveryRow[], total: count ?? data?.length ?? 0 };
}

async function downloadSourceFile(row: LeadFileRecoveryRow) {
  const { data, error } = await adminClient().storage.from(row.storage_bucket).download(row.storage_path);
  if (error || !data) throw Object.assign(new Error("Source storage object is missing or unreadable."), { name: "source_object_unavailable" });
  return Buffer.from(await data.arrayBuffer());
}

function inspectBytes(row: LeadFileRecoveryRow, bytes: Buffer) {
  const expectedSize = safeCount(row.file_size_bytes);
  const expectedSha = String(row.content_sha256 ?? "");
  const observedSha = sha256(bytes);
  const status: RecoveryItemStatus = bytes.byteLength !== expectedSize
    ? "size_mismatch"
    : expectedSha && expectedSha !== observedSha
      ? "checksum_mismatch"
      : "verified";
  return { expectedSize, expectedSha, observedSha, status };
}

async function updateSourceIntegrity(row: LeadFileRecoveryRow, item: RecoveryItem) {
  const verified = item.status === "verified";
  const update: Record<string, unknown> = {
    integrity_status: item.status,
    integrity_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (verified && !row.content_sha256) update.content_sha256 = item.observedSha256;
  const { error } = await adminClient().from("lead_files").update(update).eq("id", row.id);
  if (error) throw new Error(`Client-file integrity state update failed: ${error.message}`);
}

function manifestFor(runId: string, items: RecoveryItem[]) {
  return {
    schemaVersion: "limm-client-files-backup-manifest-v1",
    runId,
    generatedAt: new Date().toISOString(),
    objectCount: items.length,
    objects: items
      .filter((item) => item.status === "copied" || item.status === "verified")
      .map((item) => ({
        leadFileId: item.leadFileId,
        sourceBucket: item.storageBucket,
        sourcePath: item.storagePath,
        mimeType: item.mimeType,
        sizeBytes: item.observedSizeBytes,
        sha256: item.observedSha256,
        backupObjectKey: item.backupObjectKey
      }))
      .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath))
  };
}

function summarize(runId: string, runType: RecoveryRunType, status: RecoveryRunStatus, sourceObjectCount: number, items: RecoveryItem[], manifestKey = "", manifestSha256 = "", errorCode = ""): ClientFileRecoveryRunResult {
  return {
    runId,
    runType,
    status,
    sourceObjectCount,
    processedObjectCount: items.length,
    verifiedObjectCount: items.filter((item) => item.status === "verified" || item.status === "copied").length,
    copiedObjectCount: items.filter((item) => item.status === "copied").length,
    failedObjectCount: items.filter((item) => ["missing", "size_mismatch", "checksum_mismatch", "error"].includes(item.status)).length,
    sourceBytes: items.reduce((sum, item) => sum + (item.observedSizeBytes ?? 0), 0),
    copiedBytes: items.filter((item) => item.status === "copied").reduce((sum, item) => sum + (item.observedSizeBytes ?? 0), 0),
    manifestKey,
    manifestSha256,
    errorCode
  };
}

export async function runClientFileIntegrityAudit(limit = DEFAULT_OBJECT_LIMIT): Promise<ClientFileRecoveryRunResult> {
  const runId = await createRun("integrity", "source_integrity");
  const items: RecoveryItem[] = [];
  let sourceObjectCount = 0;
  try {
    const source = await listSourceFiles(limit);
    sourceObjectCount = source.total;
    for (const row of source.rows) {
      try {
        const bytes = await downloadSourceFile(row);
        const inspection = inspectBytes(row, bytes);
        const item: RecoveryItem = {
          leadFileId: row.id,
          storageBucket: row.storage_bucket,
          storagePath: row.storage_path,
          mimeType: row.mime_type,
          expectedSizeBytes: inspection.expectedSize,
          observedSizeBytes: bytes.byteLength,
          expectedSha256: inspection.expectedSha,
          observedSha256: inspection.observedSha,
          backupObjectKey: "",
          status: inspection.status,
          errorCode: inspection.status === "verified" ? "" : inspection.status
        };
        await updateSourceIntegrity(row, item);
        items.push(item);
      } catch (error) {
        const errorCode = safeErrorCode(error);
        const status: RecoveryItemStatus = errorCode === "source_object_unavailable" ? "missing" : "error";
        const item: RecoveryItem = {
          leadFileId: row.id,
          storageBucket: row.storage_bucket,
          storagePath: row.storage_path,
          mimeType: row.mime_type,
          expectedSizeBytes: safeCount(row.file_size_bytes),
          observedSizeBytes: null,
          expectedSha256: row.content_sha256 || "",
          observedSha256: "",
          backupObjectKey: "",
          status,
          errorCode
        };
        items.push(item);
        await adminClient().from("lead_files").update({
          integrity_status: status,
          integrity_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", row.id).then(() => undefined);
      }
    }
    await insertItems(runId, items);
    const manifest = manifestFor(runId, items);
    const manifestSha = sha256(JSON.stringify(manifest));
    const failed = items.some((item) => !["verified", "skipped"].includes(item.status));
    const status: RecoveryRunStatus = failed ? "failed" : items.length < sourceObjectCount ? "partial" : "succeeded";
    const result = summarize(runId, "integrity", status, sourceObjectCount, items, "", manifestSha, failed ? "source_integrity_failed" : "");
    await finishRun(runId, result, { objectLimit: Math.max(1, Math.min(limit, MAX_OBJECT_LIMIT)), fullInventoryProcessed: items.length >= sourceObjectCount });
    return result;
  } catch (error) {
    const result = summarize(runId, "integrity", "failed", sourceObjectCount, items, "", "", safeErrorCode(error));
    await finishRun(runId, result).catch(() => undefined);
    return result;
  }
}

async function objectExists(client: S3Client, bucket: string, key: string) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    const status = error && typeof error === "object" && "$metadata" in error
      ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? 0)
      : 0;
    if (status === 404 || safeErrorCode(error) === "NotFound") return false;
    throw error;
  }
}

async function putPrivateObject(client: S3Client, bucket: string, key: string, body: Buffer, contentType: string, metadata: Record<string, string> = {}) {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
    ...encryptionOptions()
  }));
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

export async function runClientFileOffsiteBackup(limit = DEFAULT_OBJECT_LIMIT): Promise<ClientFileRecoveryRunResult> {
  const runtime = getClientFileRecoveryRuntime();
  const runId = await createRun("backup", runtime.destination);
  if (!runtime.configured) {
    const result = summarize(runId, "backup", "not_configured", 0, [], "", "", "offsite_target_not_configured");
    await finishRun(runId, result, { missingConfigurationCount: runtime.missing.length });
    return result;
  }

  const items: RecoveryItem[] = [];
  let sourceObjectCount = 0;
  try {
    const client = getS3Client();
    const bucket = process.env.DR_S3_BUCKET!;
    const source = await listSourceFiles(limit);
    sourceObjectCount = source.total;
    let newlyCopiedCount = 0;
    for (const row of source.rows) {
      try {
        const bytes = await downloadSourceFile(row);
        const inspection = inspectBytes(row, bytes);
        if (inspection.status !== "verified") throw Object.assign(new Error("Source integrity check failed before backup."), { name: inspection.status });
        const objectKey = `objects/${inspection.observedSha.slice(0, 2)}/${inspection.observedSha}`;
        if (!(await objectExists(client, bucket, objectKey))) {
          await putPrivateObject(client, bucket, objectKey, bytes, row.mime_type || "application/octet-stream", {
            sha256: inspection.observedSha,
            size: String(bytes.byteLength)
          });
          newlyCopiedCount += 1;
        }
        const item: RecoveryItem = {
          leadFileId: row.id,
          storageBucket: row.storage_bucket,
          storagePath: row.storage_path,
          mimeType: row.mime_type,
          expectedSizeBytes: inspection.expectedSize,
          observedSizeBytes: bytes.byteLength,
          expectedSha256: inspection.expectedSha,
          observedSha256: inspection.observedSha,
          backupObjectKey: objectKey,
          status: "copied",
          errorCode: ""
        };
        await updateSourceIntegrity(row, { ...item, status: "verified" });
        items.push(item);
      } catch (error) {
        items.push({
          leadFileId: row.id,
          storageBucket: row.storage_bucket,
          storagePath: row.storage_path,
          mimeType: row.mime_type,
          expectedSizeBytes: safeCount(row.file_size_bytes),
          observedSizeBytes: null,
          expectedSha256: row.content_sha256 || "",
          observedSha256: "",
          backupObjectKey: "",
          status: safeErrorCode(error) === "source_object_unavailable" ? "missing" : "error",
          errorCode: safeErrorCode(error)
        });
      }
    }

    const manifest = manifestFor(runId, items);
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    const manifestSha = sha256(manifestBytes);
    const date = new Date().toISOString().slice(0, 10);
    const month = date.slice(0, 7);
    const manifestKey = `manifests/daily/${date}/${runId}.json`;
    await putPrivateObject(client, bucket, manifestKey, manifestBytes, "application/json", { sha256: manifestSha });
    const monthlyKey = `manifests/monthly/${month}/${runId}.json`;
    const existingMonthly = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `manifests/monthly/${month}/`, MaxKeys: 1 }));
    if (!existingMonthly.Contents?.length) {
      await putPrivateObject(client, bucket, monthlyKey, manifestBytes, "application/json", { sha256: manifestSha });
    }

    await insertItems(runId, items);
    const failed = items.some((item) => item.status !== "copied");
    const status: RecoveryRunStatus = failed ? "failed" : items.length < sourceObjectCount ? "partial" : "succeeded";
    const result = summarize(runId, "backup", status, sourceObjectCount, items, manifestKey, manifestSha, failed ? "offsite_copy_failed" : "");
    const dailyDeleted = await enforceManifestRetention(client, bucket, "manifests/daily/", DAILY_MANIFEST_RETENTION);
    const monthlyDeleted = await enforceManifestRetention(client, bucket, "manifests/monthly/", MONTHLY_MANIFEST_RETENTION);
    await finishRun(runId, result, {
      fullInventoryProcessed: items.length >= sourceObjectCount,
      newlyCopiedCount,
      contentAddressedObjects: true,
      dailyManifestsDeleted: dailyDeleted,
      monthlyManifestsDeleted: monthlyDeleted
    });
    return result;
  } catch (error) {
    await insertItems(runId, items).catch(() => undefined);
    const result = summarize(runId, "backup", "failed", sourceObjectCount, items, "", "", safeErrorCode(error));
    await finishRun(runId, result).catch(() => undefined);
    return result;
  }
}

async function responseBytes(body: { transformToByteArray?: () => Promise<Uint8Array> } | undefined) {
  const stream = body;
  if (!stream?.transformToByteArray) throw Object.assign(new Error("Backup object body was unavailable."), { name: "backup_object_body_unavailable" });
  return Buffer.from(await stream.transformToByteArray());
}

export async function runClientFileRestoreDrill(): Promise<ClientFileRecoveryRunResult> {
  const runtime = getClientFileRecoveryRuntime();
  const runId = await createRun("restore_drill", runtime.destination);
  if (!runtime.configured) {
    const result = summarize(runId, "restore_drill", "not_configured", 0, [], "", "", "offsite_target_not_configured");
    await finishRun(runId, result, { restoreBucketIsolated: runtime.restoreBucketIsolated });
    return result;
  }

  const { data: latestBackup, error: backupError } = await adminClient()
    .from("client_file_recovery_runs")
    .select("id,manifest_key,manifest_sha256")
    .eq("run_type", "backup")
    .eq("status", "succeeded")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (backupError || !latestBackup) {
    const result = summarize(runId, "restore_drill", "failed", 0, [], "", "", "successful_backup_not_found");
    await finishRun(runId, result, { restoreBucketIsolated: runtime.restoreBucketIsolated });
    return result;
  }

  const { data: candidates, error: itemError } = await adminClient()
    .from("client_file_recovery_items")
    .select("lead_file_id,storage_bucket,storage_path,mime_type,observed_size_bytes,observed_sha256,backup_object_key")
    .eq("run_id", latestBackup.id)
    .eq("status", "copied")
    .order("checked_at", { ascending: true });
  if (itemError) {
    const result = summarize(runId, "restore_drill", "failed", 0, [], "", "", "restore_candidate_lookup_failed");
    await finishRun(runId, result, { restoreBucketIsolated: runtime.restoreBucketIsolated });
    return result;
  }
  const all = candidates ?? [];
  const image = all.find((item) => String(item.mime_type).startsWith("image/"));
  const pdf = all.find((item) => String(item.mime_type) === "application/pdf");
  const selected = Array.from(new Map([image, pdf, ...all].filter(Boolean).map((item) => [String(item!.backup_object_key), item!])).values()).slice(0, 2);
  const items: RecoveryItem[] = [];
  const client = getS3Client();
  const sourceBucket = process.env.DR_S3_BUCKET!;
  const restoreBucket = process.env.DR_S3_RESTORE_BUCKET || sourceBucket;

  try {
    for (const candidate of selected) {
      const restoreKey = `restore-drills/${runId}/${randomUUID()}`;
      try {
        const source = await client.send(new GetObjectCommand({ Bucket: sourceBucket, Key: String(candidate.backup_object_key) }));
        const sourceBytes = await responseBytes(source.Body);
        await putPrivateObject(client, restoreBucket, restoreKey, sourceBytes, String(candidate.mime_type || "application/octet-stream"), {
          drill: runId,
          sha256: String(candidate.observed_sha256)
        });
        const restored = await client.send(new GetObjectCommand({ Bucket: restoreBucket, Key: restoreKey }));
        const restoredBytes = await responseBytes(restored.Body);
        const observedSha = sha256(restoredBytes);
        const expectedSha = String(candidate.observed_sha256 || "");
        const status: RecoveryItemStatus = restoredBytes.byteLength !== safeCount(candidate.observed_size_bytes)
          ? "size_mismatch"
          : observedSha !== expectedSha
            ? "checksum_mismatch"
            : "verified";
        items.push({
          leadFileId: String(candidate.lead_file_id),
          storageBucket: String(candidate.storage_bucket),
          storagePath: String(candidate.storage_path),
          mimeType: String(candidate.mime_type),
          expectedSizeBytes: safeCount(candidate.observed_size_bytes),
          observedSizeBytes: restoredBytes.byteLength,
          expectedSha256: expectedSha,
          observedSha256: observedSha,
          backupObjectKey: String(candidate.backup_object_key),
          status,
          errorCode: status === "verified" ? "" : status
        });
      } catch (error) {
        items.push({
          leadFileId: String(candidate.lead_file_id),
          storageBucket: String(candidate.storage_bucket),
          storagePath: String(candidate.storage_path),
          mimeType: String(candidate.mime_type),
          expectedSizeBytes: safeCount(candidate.observed_size_bytes),
          observedSizeBytes: null,
          expectedSha256: String(candidate.observed_sha256 || ""),
          observedSha256: "",
          backupObjectKey: String(candidate.backup_object_key),
          status: "error",
          errorCode: safeErrorCode(error)
        });
      } finally {
        await client.send(new DeleteObjectCommand({ Bucket: restoreBucket, Key: restoreKey })).catch(() => undefined);
      }
    }
    await insertItems(runId, items);
    const failed = !items.length || items.some((item) => item.status !== "verified");
    const result = summarize(
      runId,
      "restore_drill",
      failed ? "failed" : "succeeded",
      selected.length,
      items,
      String(latestBackup.manifest_key || ""),
      String(latestBackup.manifest_sha256 || ""),
      failed ? "restore_drill_failed" : ""
    );
    await finishRun(runId, result, {
      sourceBackupRunId: latestBackup.id,
      restoreBucketIsolated: runtime.restoreBucketIsolated,
      restoredIntoTemporaryPrivatePrefix: true,
      temporaryObjectsDeleted: true
    });
    return result;
  } catch (error) {
    const result = summarize(runId, "restore_drill", "failed", selected.length, items, "", "", safeErrorCode(error));
    await finishRun(runId, result).catch(() => undefined);
    return result;
  }
}

export async function getClientFileRecoverySnapshot(): Promise<ClientFileRecoverySnapshot> {
  const runtime = getClientFileRecoveryRuntime();
  try {
    const { data, error } = await adminClient()
      .from("client_file_recovery_runs")
      .select("run_type,status,processed_object_count,copied_object_count,failed_object_count,manifest_sha256,completed_at")
      .in("run_type", ["integrity", "backup", "restore_drill"])
      .order("completed_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const latest = (type: RecoveryRunType) => (data ?? []).find((row) => row.run_type === type);
    const integrity = latest("integrity");
    const backup = latest("backup");
    const restore = latest("restore_drill");
    return {
      available: true,
      offsiteConfigured: runtime.configured,
      destination: runtime.destination,
      restoreBucketIsolated: runtime.restoreBucketIsolated,
      latestIntegrityAt: integrity?.completed_at ?? null,
      latestIntegrityStatus: integrity?.status ?? "not_run",
      latestBackupAt: backup?.completed_at ?? null,
      latestBackupStatus: backup?.status ?? "not_run",
      latestRestoreDrillAt: restore?.completed_at ?? null,
      latestRestoreDrillStatus: restore?.status ?? "not_run",
      protectedObjectCount: safeCount(backup?.copied_object_count),
      failedObjectCount: safeCount(backup?.failed_object_count),
      manifestSha256: String(backup?.manifest_sha256 ?? "")
    };
  } catch {
    return {
      available: false,
      offsiteConfigured: runtime.configured,
      destination: runtime.destination,
      restoreBucketIsolated: runtime.restoreBucketIsolated,
      latestIntegrityAt: null,
      latestIntegrityStatus: "unavailable",
      latestBackupAt: null,
      latestBackupStatus: "unavailable",
      latestRestoreDrillAt: null,
      latestRestoreDrillStatus: "unavailable",
      protectedObjectCount: 0,
      failedObjectCount: 0,
      manifestSha256: ""
    };
  }
}
