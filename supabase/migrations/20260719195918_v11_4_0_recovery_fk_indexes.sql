-- v11.4.0 Recovery Readiness foreign-key index follow-up.
--
-- Production advisor verification identified the two nullable recovery-ledger
-- foreign keys without covering indexes. Keep this forward migration separate
-- because the base v11.4.0 migration may already be applied.

create index if not exists reliability_incidents_acknowledged_by_idx
  on public.reliability_incidents (acknowledged_by)
  where acknowledged_by is not null;

create index if not exists database_recovery_runs_source_backup_idx
  on public.database_recovery_runs (source_backup_id)
  where source_backup_id is not null;
