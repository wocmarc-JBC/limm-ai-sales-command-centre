import "server-only";

import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";
import { getClientFileRecoveryRuntime } from "@/lib/data/client-file-recovery-shared";

type RecoveryRunRow = {
  id: string;
  run_type: string;
  status: string;
  source_object_count: number | string;
  processed_object_count: number | string;
  copied_object_count: number | string;
  failed_object_count: number | string;
  manifest_sha256: string;
  metadata: Record<string, unknown> | null;
  batch_count: number | string;
  last_progress_at: string | null;
  continuation_required: boolean;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

type CoverageRow = {
  active_object_count: number | string;
  protected_object_count: number | string;
  uncovered_object_count: number | string;
  oldest_uncovered_at: string | null;
  latest_successful_backup_id: string | null;
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
  latestBackupAttemptAt: string | null;
  latestBackupAttemptStatus: string;
  latestRestoreDrillAt: string | null;
  latestRestoreDrillStatus: string;
  protectedObjectCount: number;
  activeObjectCount: number;
  uncoveredObjectCount: number;
  oldestUncoveredAt: string | null;
  failedObjectCount: number;
  manifestSha256: string;
  fullCoverageProven: boolean;
  backupInProgress: boolean;
  backupRunId: string | null;
  backupLastProgressAt: string | null;
  backupPendingObjectCount: number;
  backupBatchCount: number;
  backupMaxBatchDurationMs: number;
  backupContinuationRequired: boolean;
};

function adminClient() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin credentials are required for client-file recovery telemetry.");
  return client;
}

function safeCount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function metadataCount(metadata: Record<string, unknown> | null, key: string) {
  return safeCount(metadata?.[key]);
}

async function latestRun(runType: string, status?: string) {
  let query = adminClient()
    .from("client_file_recovery_runs")
    .select("id,run_type,status,source_object_count,processed_object_count,copied_object_count,failed_object_count,manifest_sha256,metadata,batch_count,last_progress_at,continuation_required,started_at,completed_at,created_at")
    .eq("run_type", runType)
    .order(status === "succeeded" ? "completed_at" : "created_at", { ascending: false })
    .limit(1);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Client-file ${runType} telemetry lookup failed: ${error.message}`);
  return data as RecoveryRunRow | null;
}

export async function getClientFileRecoverySnapshot(): Promise<ClientFileRecoverySnapshot> {
  const runtime = getClientFileRecoveryRuntime();
  try {
    const [integrity, successfulBackup, latestBackupAttempt, activeBackup, restore, coverageResponse] = await Promise.all([
      latestRun("integrity"),
      latestRun("backup", "succeeded"),
      latestRun("backup"),
      latestRun("backup", "running"),
      latestRun("restore_drill"),
      adminClient().rpc("get_client_file_backup_coverage")
    ]);
    if (coverageResponse.error) throw new Error(`Client-file coverage lookup failed: ${coverageResponse.error.message}`);
    const coverage = (Array.isArray(coverageResponse.data) ? coverageResponse.data[0] : coverageResponse.data) as CoverageRow | undefined;
    const activeObjectCount = safeCount(coverage?.active_object_count);
    const protectedObjectCount = safeCount(coverage?.protected_object_count);
    const uncoveredObjectCount = safeCount(coverage?.uncovered_object_count);
    const sourceObjectCount = safeCount(activeBackup?.source_object_count);
    const processedObjectCount = safeCount(activeBackup?.processed_object_count);
    const latestSuccessComplete = Boolean(
      successfulBackup &&
      successfulBackup.manifest_sha256?.match(/^[a-f0-9]{64}$/i) &&
      safeCount(successfulBackup.source_object_count) === safeCount(successfulBackup.processed_object_count) &&
      safeCount(successfulBackup.processed_object_count) === safeCount(successfulBackup.copied_object_count) &&
      safeCount(successfulBackup.failed_object_count) === 0
    );

    return {
      available: true,
      offsiteConfigured: runtime.configured,
      destination: runtime.destination,
      restoreBucketIsolated: runtime.restoreBucketIsolated,
      latestIntegrityAt: integrity?.completed_at ?? null,
      latestIntegrityStatus: integrity?.status ?? "not_run",
      latestBackupAt: successfulBackup?.completed_at ?? null,
      latestBackupStatus: successfulBackup?.status ?? "not_run",
      latestBackupAttemptAt: latestBackupAttempt?.completed_at ?? latestBackupAttempt?.started_at ?? null,
      latestBackupAttemptStatus: latestBackupAttempt?.status ?? "not_run",
      latestRestoreDrillAt: restore?.completed_at ?? null,
      latestRestoreDrillStatus: restore?.status ?? "not_run",
      protectedObjectCount,
      activeObjectCount,
      uncoveredObjectCount,
      oldestUncoveredAt: coverage?.oldest_uncovered_at ?? null,
      failedObjectCount: safeCount(successfulBackup?.failed_object_count),
      manifestSha256: String(successfulBackup?.manifest_sha256 ?? ""),
      fullCoverageProven: latestSuccessComplete && uncoveredObjectCount === 0 && protectedObjectCount === activeObjectCount,
      backupInProgress: Boolean(activeBackup),
      backupRunId: activeBackup?.id ?? null,
      backupLastProgressAt: activeBackup?.last_progress_at ?? null,
      backupPendingObjectCount: activeBackup
        ? Math.max(0, sourceObjectCount - processedObjectCount)
        : 0,
      backupBatchCount: safeCount(activeBackup?.batch_count ?? successfulBackup?.batch_count),
      backupMaxBatchDurationMs: metadataCount(
        activeBackup?.metadata ?? successfulBackup?.metadata ?? null,
        "maxBatchDurationMs"
      ),
      backupContinuationRequired: Boolean(activeBackup?.continuation_required)
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
      latestBackupAttemptAt: null,
      latestBackupAttemptStatus: "unavailable",
      latestRestoreDrillAt: null,
      latestRestoreDrillStatus: "unavailable",
      protectedObjectCount: 0,
      activeObjectCount: 0,
      uncoveredObjectCount: 0,
      oldestUncoveredAt: null,
      failedObjectCount: 0,
      manifestSha256: "",
      fullCoverageProven: false,
      backupInProgress: false,
      backupRunId: null,
      backupLastProgressAt: null,
      backupPendingObjectCount: 0,
      backupBatchCount: 0,
      backupMaxBatchDurationMs: 0,
      backupContinuationRequired: false
    };
  }
}
