-- v11.4.0 Recovery Readiness.
--
-- Adds a service-only incident ledger, independent database backup/restore
-- evidence, and a five-minute no-send watchdog dispatch. Readiness is derived
-- from completed evidence and never from configuration claims alone.

create table if not exists public.reliability_incidents (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique check (char_length(fingerprint) between 3 and 160),
  incident_type text not null check (char_length(incident_type) between 3 and 100),
  component text not null check (char_length(component) between 2 and 100),
  severity text not null check (severity in ('warning','critical')),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  title text not null check (char_length(title) between 3 and 180),
  safe_summary text not null default '' check (char_length(safe_summary) <= 500),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  notification_count integer not null default 0 check (notification_count >= 0),
  last_notified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reliability_incidents_active_severity_idx
  on public.reliability_incidents (severity, last_detected_at desc)
  where status in ('open','acknowledged');
create index if not exists reliability_incidents_resolved_at_idx
  on public.reliability_incidents (resolved_at desc)
  where status = 'resolved';
create index if not exists reliability_incidents_acknowledged_by_idx
  on public.reliability_incidents (acknowledged_by)
  where acknowledged_by is not null;

create table if not exists public.database_recovery_runs (
  id uuid primary key default gen_random_uuid(),
  external_run_id text not null unique check (char_length(external_run_id) between 3 and 160),
  run_type text not null check (run_type in ('backup','restore_drill')),
  status text not null check (status in ('running','succeeded','failed')),
  provider text not null default 'independent_pg_dump' check (char_length(provider) between 3 and 100),
  artifact_sha256 text not null default '' check (char_length(artifact_sha256) <= 128),
  artifact_size_bytes bigint not null default 0 check (artifact_size_bytes >= 0),
  source_backup_id uuid references public.database_recovery_runs(id) on delete set null,
  isolated_restore boolean not null default false,
  schema_checks_passed integer not null default 0 check (schema_checks_passed >= 0),
  row_checks_passed integer not null default 0 check (row_checks_passed >= 0),
  error_code text not null default '' check (char_length(error_code) <= 100),
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists database_recovery_runs_type_completed_idx
  on public.database_recovery_runs (run_type, completed_at desc);
create index if not exists database_recovery_runs_source_backup_idx
  on public.database_recovery_runs (source_backup_id)
  where source_backup_id is not null;

alter table public.reliability_incidents enable row level security;
alter table public.database_recovery_runs enable row level security;

revoke all on table public.reliability_incidents from public, anon, authenticated;
revoke all on table public.database_recovery_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.reliability_incidents to service_role;
grant select, insert, update, delete on table public.database_recovery_runs to service_role;

drop policy if exists reliability_incidents_service_role on public.reliability_incidents;
create policy reliability_incidents_service_role on public.reliability_incidents
for all to service_role using (true) with check (true);

drop policy if exists database_recovery_runs_service_role on public.database_recovery_runs;
create policy database_recovery_runs_service_role on public.database_recovery_runs
for all to service_role using (true) with check (true);

create or replace function public.upsert_reliability_incident(
  p_fingerprint text,
  p_incident_type text,
  p_component text,
  p_severity text,
  p_title text,
  p_safe_summary text,
  p_metadata jsonb,
  p_detected_at timestamptz
)
returns table (
  incident_id uuid,
  incident_status text,
  incident_first_detected_at timestamptz,
  incident_occurrence_count integer
)
language sql
security invoker
set search_path = ''
as $$
  insert into public.reliability_incidents as incident (
    fingerprint, incident_type, component, severity, status, title, safe_summary,
    first_detected_at, last_detected_at, metadata, created_at, updated_at
  ) values (
    p_fingerprint, p_incident_type, p_component, p_severity, 'open', p_title,
    p_safe_summary, p_detected_at, p_detected_at, coalesce(p_metadata, '{}'::jsonb),
    p_detected_at, p_detected_at
  )
  on conflict (fingerprint) do update set
    incident_type = excluded.incident_type,
    component = excluded.component,
    severity = excluded.severity,
    status = case when incident.status = 'resolved' then 'open' else incident.status end,
    title = excluded.title,
    safe_summary = excluded.safe_summary,
    first_detected_at = case when incident.status = 'resolved' then excluded.first_detected_at else incident.first_detected_at end,
    last_detected_at = excluded.last_detected_at,
    acknowledged_at = case when incident.status = 'resolved' then null else incident.acknowledged_at end,
    acknowledged_by = case when incident.status = 'resolved' then null else incident.acknowledged_by end,
    resolved_at = null,
    occurrence_count = incident.occurrence_count + 1,
    last_notified_at = case when incident.status = 'resolved' then null else incident.last_notified_at end,
    metadata = excluded.metadata,
    updated_at = excluded.updated_at
  returning incident.id, incident.status, incident.first_detected_at, incident.occurrence_count
$$;

revoke all on function public.upsert_reliability_incident(text,text,text,text,text,text,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_reliability_incident(text,text,text,text,text,text,jsonb,timestamptz) to service_role;

create or replace function limm_private.dispatch_reliability_watchdog()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select limm_private.dispatch_reliability_endpoint(
    'reliability_watchdog',
    'limm_reliability_watchdog_url'
  )
$$;

revoke all on function limm_private.dispatch_reliability_watchdog() from public, anon, authenticated;

create or replace function limm_private.prune_reliability_history()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed_deleted integer := 0;
  v_dead_letters_deleted integer := 0;
  v_dispatches_deleted integer := 0;
  v_incidents_deleted integer := 0;
  v_database_runs_deleted integer := 0;
begin
  delete from public.whatsapp_inbound_jobs job
  where job.status = 'completed'
    and job.completed_at < now() - interval '30 days';
  get diagnostics v_completed_deleted = row_count;

  delete from public.whatsapp_inbound_jobs job
  where job.status = 'failed'
    and job.dead_lettered_at < now() - interval '90 days';
  get diagnostics v_dead_letters_deleted = row_count;

  delete from public.reliability_dispatches dispatch
  where dispatch.requested_at < now() - interval '30 days';
  get diagnostics v_dispatches_deleted = row_count;

  delete from public.reliability_incidents incident
  where incident.status = 'resolved'
    and incident.resolved_at < now() - interval '180 days';
  get diagnostics v_incidents_deleted = row_count;

  delete from public.database_recovery_runs run
  where run.completed_at < now() - interval '400 days';
  get diagnostics v_database_runs_deleted = row_count;

  return jsonb_build_object(
    'completedJobsDeleted', v_completed_deleted,
    'deadLettersDeleted', v_dead_letters_deleted,
    'dispatchesDeleted', v_dispatches_deleted,
    'resolvedIncidentsDeleted', v_incidents_deleted,
    'databaseRecoveryRunsDeleted', v_database_runs_deleted
  );
end;
$$;

revoke all on function limm_private.prune_reliability_history() from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'limm-reliability-watchdog-five-minutes' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'limm-reliability-watchdog-five-minutes',
    '*/5 * * * *',
    'select limm_private.dispatch_reliability_watchdog();'
  );
end $$;

comment on table public.reliability_incidents is
  'v11.4 service-only, deduplicated reliability incidents without client data or secrets.';
comment on table public.database_recovery_runs is
  'v11.4 evidence from independent encrypted database backup and isolated restore drills.';
comment on function limm_private.dispatch_reliability_watchdog() is
  'Dispatches the no-send reliability watchdog through a Vault URL and service-only token.';
