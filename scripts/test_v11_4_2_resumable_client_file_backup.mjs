import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260725044500_v11_4_2_resumable_client_file_backups.sql");
const finalizationLease = read("supabase/migrations/20260725044600_v11_4_2_backup_finalization_lease.sql");
const batch = read("lib/data/client-file-backup-batch-repository.ts");
const shared = read("lib/data/client-file-recovery-shared.ts");
const repository = read("lib/data/client-file-recovery-repository.ts");
const snapshot = read("lib/data/client-file-recovery-snapshot-repository.ts");
const runtimeGuard = read("lib/data/client-file-recovery-runtime-guard.ts");
const route = read("app/api/operations/client-file-recovery/route.ts");
const schemaGate = read("scripts/verify_production_schema_gate.mjs");
const packageJson = JSON.parse(read("package.json"));

assert.match(packageJson.scripts["test:v11.4.2"], /test_v11_4_2_resumable_client_file_backup\.mjs/);
assert.match(packageJson.scripts.verify, /test:v11\.4\.2/);

assert.match(migration, /add column if not exists inventory_snapshot_at timestamptz/);
assert.match(migration, /add column if not exists batch_count integer not null default 0/);
assert.match(migration, /add column if not exists last_progress_at timestamptz/);
assert.match(migration, /add column if not exists continuation_required boolean not null default false/);
assert.match(migration, /add column if not exists lease_token uuid/);
assert.match(migration, /add column if not exists lease_expires_at timestamptz/);
assert.match(migration, /add column if not exists source_uploaded_at timestamptz/);
assert.match(migration, /add column if not exists attempt_count integer not null default 0/);
assert.match(migration, /'pending', 'verified', 'copied'/);
assert.match(migration, /client_file_recovery_one_running_backup_idx/);
assert.match(migration, /client_file_recovery_items_pending_idx/);
assert.match(migration, /lead_files_recovery_inventory_idx/);
assert.match(migration, /start_or_resume_client_file_backup/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /fullInventoryQueued/);
assert.match(migration, /claim_client_file_backup_run/);
assert.match(migration, /refresh_client_file_backup_progress/);
assert.match(migration, /get_client_file_backup_coverage/);
assert.match(migration, /dispatch_client_file_backup_continuation/);
assert.match(migration, /params := jsonb_build_object\([\s\S]*'mode', 'continue'[\s\S]*'run_id'/);
assert.match(migration, /limm-client-file-backup-continuation-minute/);
assert.match(migration, /'\* \* \* \* \*'/);
assert.match(migration, /client_file_resumable_backup_schema_ready/);
assert.match(migration, /revoke all on function public\.start_or_resume_client_file_backup/);
assert.match(migration, /grant execute on function public\.get_client_file_backup_coverage\(\) to service_role/);
assert.doesNotMatch(migration, /grant execute[\s\S]*to anon|grant execute[\s\S]*to authenticated/);

assert.match(finalizationLease, /continuation_required = true/);
assert.match(finalizationLease, /lease_token = case when v_pending > 0 then null else p_lease_token end/);
assert.match(finalizationLease, /finalizationRequired/);

assert.match(shared, /CLIENT_FILE_DAILY_MANIFEST_RETENTION = 35/);
assert.match(shared, /CLIENT_FILE_MONTHLY_MANIFEST_RETENTION = 12/);
assert.match(repository, /getClientFileRecoverySnapshot/);
assert.match(repository, /client-file-recovery-snapshot-repository/);
assert.doesNotMatch(repository, /runClientFileOffsiteBackup\(/);

assert.match(batch, /BACKUP_BATCH_OBJECT_LIMIT = 12/);
assert.match(batch, /BACKUP_BATCH_TIME_BUDGET_MS = 42_000/);
assert.match(batch, /BACKUP_LEASE_SECONDS = 55/);
assert.match(batch, /MAX_ITEM_ATTEMPTS = 3/);
assert.match(batch, /ITEM_OPERATION_TIMEOUT_MS = 30_000/);
assert.match(batch, /start_or_resume_client_file_backup/);
assert.match(batch, /claim_client_file_backup_run/);
assert.match(batch, /refresh_client_file_backup_progress/);
assert.match(batch, /\.eq\("status", "pending"\)/);
assert.match(batch, /attemptCount < MAX_ITEM_ATTEMPTS/);
assert.match(batch, /objects\/\$\{inspection\.observedSha\.slice\(0, 2\)\}\/\$\{inspection\.observedSha\}/);
assert.match(batch, /limm-client-files-backup-manifest-v2/);
assert.match(batch, /\.range\(from, from \+ MANIFEST_PAGE_SIZE - 1\)/);
assert.match(batch, /fullCoverageProven/);
assert.match(batch, /\.eq\("lease_token", leaseToken\)/);
assert.match(batch, /continuationRequired: true/);
assert.doesNotMatch(batch, /sendWhatsApp|WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/);

assert.match(route, /mode = url\.searchParams\.get\("mode"\) === "continue"/);
assert.match(route, /requestedRunId = url\.searchParams\.get\("run_id"\)/);
assert.match(route, /runClientFileOffsiteBackupBatch/);
assert.match(route, /status: "idle"/);
assert.match(route, /batchDurationMs/);
assert.match(route, /continuationRequired/);

assert.match(runtimeGuard, /\.lt\("last_progress_at", cutoff\)/);
assert.match(runtimeGuard, /lease_expires_at\.is\.null/);
assert.match(runtimeGuard, /continuation_required: false/);
assert.doesNotMatch(runtimeGuard, /\.lt\("started_at", cutoff\)/);

assert.match(snapshot, /latestRun\("backup", "succeeded"\)/);
assert.match(snapshot, /latestRun\("backup", "running"\)/);
assert.match(snapshot, /get_client_file_backup_coverage/);
assert.match(snapshot, /coveragePastRpo/);
assert.match(snapshot, /activeRunStalled/);
assert.match(snapshot, /newerFailedAttempt/);
assert.match(snapshot, /fullCoverageProven/);
assert.doesNotMatch(snapshot, /latestBackupStatus: activeBackup\?\.status/);

assert.match(schemaGate, /inventory_snapshot_at/);
assert.match(schemaGate, /continuation_required/);
assert.match(schemaGate, /source_uploaded_at/);
assert.match(schemaGate, /attempt_count/);
assert.match(schemaGate, /client_file_resumable_backup_schema_ready/);
assert.match(schemaGate, /4 readiness contracts/);

console.log("PASS v11.4.2 resumable paginated client-file backup, durable checkpoints, lease safety, full-inventory coverage proof, and minute continuation recovery");
