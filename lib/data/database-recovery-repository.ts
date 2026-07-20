import "server-only";

import { getSupabaseAdminClient } from "./supabase-admin";

export const DATABASE_BACKUP_RPO_HOURS = 24;
export const DATABASE_BACKUP_FRESHNESS_HOURS = 26;
export const DATABASE_RESTORE_RTO_HOURS = 4;
export const DATABASE_RESTORE_DRILL_FRESHNESS_DAYS = 35;
export const DATABASE_CORE_SCOPE_PROVIDER = "independent_pg_dump_s3_core_no_managed_schemas";
export const DATABASE_FULL_SCOPE_PROVIDER = "independent_pg_dump_s3_full_managed_schemas";
export const DATABASE_RECOVERY_MANAGED_SCHEMA_RISK = "supabase_managed_auth_and_storage_schemas_not_in_independent_backup";

type DatabaseRecoveryRow = {
  id: string;
  external_run_id: string;
  run_type: "backup" | "restore_drill";
  status: "running" | "succeeded" | "failed";
  provider: string;
  artifact_sha256: string;
  artifact_size_bytes: number | string;
  source_backup_id: string | null;
  isolated_restore: boolean;
  schema_checks_passed: number | string;
  row_checks_passed: number | string;
  error_code: string;
  started_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type DatabaseRecoverySnapshot = {
  available: boolean;
  evidenceReporterConfigured: boolean;
  backupConfigured: boolean;
  provider: string;
  latestBackupAt: string | null;
  latestBackupStatus: string;
  latestBackupArtifactVerified: boolean;
  latestBackupScope: "full_database" | "core_business_data" | "unknown";
  latestBackupScopeComplete: boolean;
  latestRestoreDrillAt: string | null;
  latestRestoreDrillStatus: string;
  latestRestoreIsolated: boolean;
  latestRestoreMatchesBackup: boolean;
  latestRestoreSchemaChecks: number;
  latestRestoreRowChecks: number;
  coreBusinessDataRecoveryProven: boolean;
  unresolvedRisk: string | null;
  backupFresh: boolean;
  restoreDrillFresh: boolean;
  ready: boolean;
  rpoHours: number;
  rtoHours: number;
};

export type DatabaseRecoveryEvidenceInput = {
  externalRunId: string;
  runType: "backup" | "restore_drill";
  status: "succeeded" | "failed";
  provider: string;
  artifactSha256: string;
  artifactSizeBytes: number;
  sourceBackupExternalRunId?: string;
  isolatedRestore: boolean;
  schemaChecksPassed: number;
  rowChecksPassed: number;
  errorCode: string;
  startedAt: string;
  completedAt: string;
  metadata: Record<string, string | number | boolean>;
};

function adminClient() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin credentials are required for database recovery evidence.");
  return client;
}

function count(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function fresh(value: string | null, maxAgeMs: number) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp >= 0 && Date.now() - timestamp <= maxAgeMs;
}

function backupScope(row: DatabaseRecoveryRow | undefined): DatabaseRecoverySnapshot["latestBackupScope"] {
  if (row?.metadata?.databaseScope === "full_database") return "full_database";
  if (row?.metadata?.databaseScope === "core_business_data" || row?.provider === DATABASE_CORE_SCOPE_PROVIDER) {
    return "core_business_data";
  }
  return "unknown";
}

function fullScopeComplete(row: DatabaseRecoveryRow | undefined) {
  return Boolean(
    row?.provider === DATABASE_FULL_SCOPE_PROVIDER &&
    backupScope(row) === "full_database" &&
    row.metadata?.managedAuthIncluded === true &&
    row.metadata?.managedStorageIncluded === true
  );
}

function fallbackSnapshot(): DatabaseRecoverySnapshot {
  return {
    available: false,
    evidenceReporterConfigured: Boolean(process.env.RELIABILITY_EVIDENCE_TOKEN),
    backupConfigured: false,
    provider: "independent_pg_dump",
    latestBackupAt: null,
    latestBackupStatus: "unavailable",
    latestBackupArtifactVerified: false,
    latestBackupScope: "unknown",
    latestBackupScopeComplete: false,
    latestRestoreDrillAt: null,
    latestRestoreDrillStatus: "unavailable",
    latestRestoreIsolated: false,
    latestRestoreMatchesBackup: false,
    latestRestoreSchemaChecks: 0,
    latestRestoreRowChecks: 0,
    coreBusinessDataRecoveryProven: false,
    unresolvedRisk: null,
    backupFresh: false,
    restoreDrillFresh: false,
    ready: false,
    rpoHours: DATABASE_BACKUP_RPO_HOURS,
    rtoHours: DATABASE_RESTORE_RTO_HOURS
  };
}

export async function getDatabaseRecoverySnapshot(): Promise<DatabaseRecoverySnapshot> {
  try {
    const { data, error } = await adminClient()
      .from("database_recovery_runs")
      .select("id,external_run_id,run_type,status,provider,artifact_sha256,artifact_size_bytes,source_backup_id,isolated_restore,schema_checks_passed,row_checks_passed,error_code,started_at,completed_at,metadata")
      .order("completed_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const rows = (data ?? []) as DatabaseRecoveryRow[];
    const backup = rows.find((row) => row.run_type === "backup");
    const restore = rows.find((row) => row.run_type === "restore_drill");
    const restoreSourceBackup = restore?.source_backup_id
      ? rows.find((row) => row.id === restore.source_backup_id && row.run_type === "backup")
      : undefined;
    const backupFresh = fresh(backup?.completed_at ?? null, DATABASE_BACKUP_FRESHNESS_HOURS * 60 * 60 * 1000);
    const restoreDrillFresh = fresh(restore?.completed_at ?? null, DATABASE_RESTORE_DRILL_FRESHNESS_DAYS * 24 * 60 * 60 * 1000);
    const latestBackupArtifactVerified = Boolean(
      backup?.status === "succeeded" &&
      /^[a-f0-9]{64}$/i.test(backup.artifact_sha256) &&
      count(backup.artifact_size_bytes) > 0
    );
    const latestRestoreIsolated = Boolean(restore?.isolated_restore);
    // A restore drill proves the exact artifact it names. Newer nightly backups must
    // not invalidate that monthly proof; they are evaluated separately for RPO.
    const latestRestoreMatchesBackup = Boolean(
      restore &&
      restoreSourceBackup?.status === "succeeded" &&
      restore.source_backup_id === restoreSourceBackup.id &&
      /^[a-f0-9]{64}$/i.test(restore.artifact_sha256) &&
      restore.artifact_sha256.toLowerCase() === restoreSourceBackup.artifact_sha256.toLowerCase() &&
      count(restore.artifact_size_bytes) > 0 &&
      count(restore.artifact_size_bytes) === count(restoreSourceBackup.artifact_size_bytes) &&
      restore.provider === restoreSourceBackup.provider &&
      restore.metadata?.databaseScope === restoreSourceBackup.metadata?.databaseScope
    );
    const latestRestoreSchemaChecks = count(restore?.schema_checks_passed);
    const latestRestoreRowChecks = count(restore?.row_checks_passed);
    const latestBackupScope = backupScope(backup);
    const latestBackupScopeComplete = fullScopeComplete(backup);
    const restoreSourceBackupScope = backupScope(restoreSourceBackup);
    const restoreSourceBackupScopeComplete = fullScopeComplete(restoreSourceBackup);
    const commonRecoveryProof = Boolean(
      backup?.status === "succeeded" &&
      backupFresh &&
      latestBackupArtifactVerified &&
      restore?.status === "succeeded" &&
      restoreDrillFresh &&
      latestRestoreIsolated &&
      latestRestoreMatchesBackup &&
      latestRestoreSchemaChecks > 0 &&
      latestRestoreRowChecks > 0
    );
    const coreBusinessDataRecoveryProven = Boolean(
      commonRecoveryProof &&
      restoreSourceBackup?.provider === DATABASE_CORE_SCOPE_PROVIDER &&
      restore?.provider === DATABASE_CORE_SCOPE_PROVIDER &&
      restoreSourceBackupScope === "core_business_data" &&
      restore.metadata?.databaseScope === "core_business_data" &&
      restore.metadata?.managedAuthIncluded === false &&
      restore.metadata?.managedStorageIncluded === false
    );
    const fullDatabaseRecoveryProven = Boolean(
      commonRecoveryProof &&
      latestBackupScopeComplete &&
      restoreSourceBackupScopeComplete &&
      restore?.provider === DATABASE_FULL_SCOPE_PROVIDER &&
      restore.metadata?.databaseScope === "full_database" &&
      restore.metadata?.managedAuthIncluded === true &&
      restore.metadata?.managedStorageIncluded === true
    );
    return {
      available: true,
      evidenceReporterConfigured: Boolean(process.env.RELIABILITY_EVIDENCE_TOKEN),
      backupConfigured: rows.length > 0,
      provider: backup?.provider || restore?.provider || "independent_pg_dump",
      latestBackupAt: backup?.completed_at ?? null,
      latestBackupStatus: backup?.status ?? "not_run",
      latestBackupArtifactVerified,
      latestBackupScope,
      latestBackupScopeComplete,
      latestRestoreDrillAt: restore?.completed_at ?? null,
      latestRestoreDrillStatus: restore?.status ?? "not_run",
      latestRestoreIsolated,
      latestRestoreMatchesBackup,
      latestRestoreSchemaChecks,
      latestRestoreRowChecks,
      coreBusinessDataRecoveryProven,
      unresolvedRisk: latestBackupScope === "core_business_data" ? DATABASE_RECOVERY_MANAGED_SCHEMA_RISK : null,
      backupFresh,
      restoreDrillFresh,
      ready: fullDatabaseRecoveryProven,
      rpoHours: DATABASE_BACKUP_RPO_HOURS,
      rtoHours: DATABASE_RESTORE_RTO_HOURS
    };
  } catch {
    return fallbackSnapshot();
  }
}

function boundedText(value: string, max: number, fallback: string) {
  const clean = value.replace(/[^a-zA-Z0-9_.:@/-]/g, "_").slice(0, max);
  return clean || fallback;
}

function assertEvidenceTime(startedAt: string, completedAt: string) {
  const started = new Date(startedAt).getTime();
  const completed = new Date(completedAt).getTime();
  const now = Date.now();
  if (!Number.isFinite(started) || !Number.isFinite(completed)) throw new Error("invalid_evidence_timestamp");
  if (started > completed || completed > now + 5 * 60 * 1000) throw new Error("invalid_evidence_time_order");
  if (completed - started > 24 * 60 * 60 * 1000) throw new Error("invalid_evidence_duration");
}

export async function recordDatabaseRecoveryEvidence(input: DatabaseRecoveryEvidenceInput) {
  assertEvidenceTime(input.startedAt, input.completedAt);
  if (input.status === "succeeded" && !/^[a-f0-9]{64}$/i.test(input.artifactSha256)) {
    throw new Error("invalid_artifact_checksum");
  }
  if (input.status === "succeeded" && input.artifactSizeBytes <= 0) throw new Error("invalid_artifact_size");
  if (input.runType === "restore_drill" && input.status === "succeeded" && !input.isolatedRestore) {
    throw new Error("restore_not_isolated");
  }

  let sourceBackupId: string | null = null;
  if (input.sourceBackupExternalRunId) {
    const { data } = await adminClient()
      .from("database_recovery_runs")
      .select("id")
      .eq("external_run_id", boundedText(input.sourceBackupExternalRunId, 160, "unknown"))
      .eq("run_type", "backup")
      .maybeSingle();
    sourceBackupId = data?.id ? String(data.id) : null;
  }

  const row = {
    external_run_id: boundedText(input.externalRunId, 160, "unknown_run"),
    run_type: input.runType,
    status: input.status,
    provider: boundedText(input.provider, 100, "independent_pg_dump"),
    artifact_sha256: input.artifactSha256.toLowerCase().slice(0, 128),
    artifact_size_bytes: Math.max(0, Math.round(input.artifactSizeBytes)),
    source_backup_id: sourceBackupId,
    isolated_restore: input.runType === "restore_drill" && input.isolatedRestore,
    schema_checks_passed: Math.max(0, Math.round(input.schemaChecksPassed)),
    row_checks_passed: Math.max(0, Math.round(input.rowChecksPassed)),
    error_code: boundedText(input.errorCode, 100, input.status === "failed" ? "recovery_run_failed" : "none"),
    metadata: input.metadata,
    started_at: new Date(input.startedAt).toISOString(),
    completed_at: new Date(input.completedAt).toISOString()
  };
  const { data, error } = await adminClient()
    .from("database_recovery_runs")
    .upsert(row, { onConflict: "external_run_id" })
    .select("id,run_type,status,completed_at")
    .single();
  if (error || !data) throw new Error(`Database recovery evidence persistence failed: ${error?.message ?? "missing_row"}`);
  return {
    id: String(data.id),
    runType: String(data.run_type),
    status: String(data.status),
    completedAt: String(data.completed_at)
  };
}
