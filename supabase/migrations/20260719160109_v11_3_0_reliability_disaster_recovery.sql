-- v11.3.0 Reliability and disaster-recovery control plane.
--
-- This migration closes the durable WhatsApp worker lease-recovery gap,
-- records every processing attempt, exposes service-only queue health,
-- enables encrypted scheduler dispatch through Supabase Vault, and adds
-- auditable client-file integrity/backup/restore-run records.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create extension if not exists pg_net;

alter table public.whatsapp_inbound_jobs
  add column if not exists max_attempts integer not null default 8 check (max_attempts >= 1),
  add column if not exists manual_requeue_count integer not null default 0 check (manual_requeue_count >= 0),
  add column if not exists last_started_at timestamptz,
  add column if not exists last_finished_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists dead_lettered_at timestamptz;

create table if not exists public.whatsapp_inbound_job_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.whatsapp_inbound_jobs(id) on delete cascade,
  attempt_number integer not null check (attempt_number >= 1),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null default 'processing'
    check (outcome in ('processing','completed','retry_scheduled','dead_lettered')),
  error_code text not null default '',
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  lease_recovered boolean not null default false,
  created_at timestamptz not null default now(),
  unique (job_id, attempt_number)
);

create index if not exists whatsapp_inbound_job_attempts_job_idx
  on public.whatsapp_inbound_job_attempts (job_id, attempt_number desc);
create index if not exists whatsapp_inbound_job_attempts_outcome_idx
  on public.whatsapp_inbound_job_attempts (outcome, started_at desc);

alter table public.whatsapp_inbound_job_attempts enable row level security;
revoke all on table public.whatsapp_inbound_job_attempts from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_inbound_job_attempts to service_role;
drop policy if exists whatsapp_inbound_job_attempts_service_role on public.whatsapp_inbound_job_attempts;
create policy whatsapp_inbound_job_attempts_service_role on public.whatsapp_inbound_job_attempts
for all to service_role using (true) with check (true);

create or replace function public.claim_whatsapp_inbound_job(p_job_id uuid default null)
returns setof public.whatsapp_inbound_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_attempt_number integer;
  v_lease_recovered boolean := false;
begin
  select job.id,
         job.attempt_count + 1,
         job.status = 'processing'
    into v_id, v_attempt_number, v_lease_recovered
  from public.whatsapp_inbound_jobs job
  where (p_job_id is null or job.id = p_job_id)
    and job.attempt_count < job.max_attempts
    and (
      (job.status in ('queued','failed') and job.available_at <= now())
      or (
        job.status = 'processing'
        and job.locked_at is not null
        and job.locked_at < now() - interval '5 minutes'
      )
    )
  order by
    case when job.status = 'processing' then 0 else 1 end,
    job.available_at,
    job.created_at
  for update skip locked
  limit 1;

  if v_id is null then return; end if;

  update public.whatsapp_inbound_jobs job
  set status = 'processing',
      locked_at = now(),
      attempt_count = v_attempt_number,
      last_started_at = now(),
      updated_at = now()
  where job.id = v_id;

  insert into public.whatsapp_inbound_job_attempts (
    job_id, attempt_number, started_at, outcome, lease_recovered
  ) values (
    v_id, v_attempt_number, now(), 'processing', v_lease_recovered
  ) on conflict (job_id, attempt_number) do update
    set started_at = excluded.started_at,
        finished_at = null,
        outcome = 'processing',
        error_code = '',
        duration_ms = null,
        lease_recovered = excluded.lease_recovered;

  return query
  select job.* from public.whatsapp_inbound_jobs job where job.id = v_id;
end;
$$;

revoke all on function public.claim_whatsapp_inbound_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_inbound_job(uuid) to service_role;

create or replace function public.complete_whatsapp_inbound_job(
  p_job_id uuid,
  p_attempt_number integer,
  p_result jsonb,
  p_duration_ms integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_changed integer := 0;
begin
  update public.whatsapp_inbound_jobs job
  set status = 'completed',
      completed_at = now(),
      locked_at = null,
      last_finished_at = now(),
      last_error_code = '',
      result = coalesce(p_result, '{}'::jsonb),
      updated_at = now()
  where job.id = p_job_id
    and job.status = 'processing'
    and job.attempt_count = p_attempt_number;
  get diagnostics v_changed = row_count;

  if v_changed = 0 then return false; end if;

  update public.whatsapp_inbound_job_attempts attempt
  set finished_at = now(),
      outcome = 'completed',
      error_code = '',
      duration_ms = greatest(0, coalesce(p_duration_ms, 0))
  where attempt.job_id = p_job_id
    and attempt.attempt_number = p_attempt_number;
  return true;
end;
$$;

revoke all on function public.complete_whatsapp_inbound_job(uuid,integer,jsonb,integer) from public, anon, authenticated;
grant execute on function public.complete_whatsapp_inbound_job(uuid,integer,jsonb,integer) to service_role;

create or replace function public.retry_whatsapp_inbound_job(
  p_job_id uuid,
  p_attempt_number integer,
  p_error_code text,
  p_delay_seconds integer,
  p_terminal boolean,
  p_duration_ms integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_changed integer := 0;
begin
  update public.whatsapp_inbound_jobs job
  set status = case when p_terminal then 'failed' else 'queued' end,
      available_at = now() + make_interval(secs => greatest(1, least(coalesce(p_delay_seconds, 1), 300))),
      locked_at = null,
      last_finished_at = now(),
      last_error_at = now(),
      last_error_code = left(coalesce(p_error_code, 'unknown_processing_error'), 100),
      dead_lettered_at = case when p_terminal then now() else null end,
      updated_at = now()
  where job.id = p_job_id
    and job.status = 'processing'
    and job.attempt_count = p_attempt_number;
  get diagnostics v_changed = row_count;

  if v_changed = 0 then return false; end if;

  update public.whatsapp_inbound_job_attempts attempt
  set finished_at = now(),
      outcome = case when p_terminal then 'dead_lettered' else 'retry_scheduled' end,
      error_code = left(coalesce(p_error_code, 'unknown_processing_error'), 100),
      duration_ms = greatest(0, coalesce(p_duration_ms, 0))
  where attempt.job_id = p_job_id
    and attempt.attempt_number = p_attempt_number;
  return true;
end;
$$;

revoke all on function public.retry_whatsapp_inbound_job(uuid,integer,text,integer,boolean,integer) from public, anon, authenticated;
grant execute on function public.retry_whatsapp_inbound_job(uuid,integer,text,integer,boolean,integer) to service_role;

create or replace function public.requeue_whatsapp_inbound_job(p_job_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_changed integer := 0;
begin
  update public.whatsapp_inbound_jobs job
  set status = 'queued',
      max_attempts = job.max_attempts + 8,
      manual_requeue_count = job.manual_requeue_count + 1,
      available_at = now(),
      locked_at = null,
      completed_at = null,
      dead_lettered_at = null,
      last_error_code = '',
      result = coalesce(job.result, '{}'::jsonb) || jsonb_build_object(
        'manualRequeueCount', job.manual_requeue_count + 1,
        'manualRequeuedAt', now()
      ),
      updated_at = now()
  where job.id = p_job_id
    and job.status = 'failed';
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$$;

revoke all on function public.requeue_whatsapp_inbound_job(uuid) from public, anon, authenticated;
grant execute on function public.requeue_whatsapp_inbound_job(uuid) to service_role;

create table if not exists public.reliability_heartbeats (
  service_name text primary key,
  status text not null check (status in ('running','healthy','degraded','failed')),
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.reliability_dispatches (
  id uuid primary key default gen_random_uuid(),
  service_name text not null,
  request_id bigint,
  status text not null default 'dispatched' check (status in ('dispatched','configuration_error')),
  error_code text not null default '',
  requested_at timestamptz not null default now()
);

create index if not exists reliability_dispatches_service_requested_idx
  on public.reliability_dispatches (service_name, requested_at desc);

alter table public.reliability_heartbeats enable row level security;
alter table public.reliability_dispatches enable row level security;
revoke all on table public.reliability_heartbeats from public, anon, authenticated;
revoke all on table public.reliability_dispatches from public, anon, authenticated;
grant select, insert, update, delete on table public.reliability_heartbeats to service_role;
grant select, insert, update, delete on table public.reliability_dispatches to service_role;
drop policy if exists reliability_heartbeats_service_role on public.reliability_heartbeats;
create policy reliability_heartbeats_service_role on public.reliability_heartbeats
for all to service_role using (true) with check (true);
drop policy if exists reliability_dispatches_service_role on public.reliability_dispatches;
create policy reliability_dispatches_service_role on public.reliability_dispatches
for all to service_role using (true) with check (true);

create or replace function public.verify_limm_scheduler_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    length(coalesce(p_token, '')) >= 32
    and extensions.digest(convert_to(p_token, 'UTF8'), 'sha256') = extensions.digest(
      convert_to(secret.decrypted_secret, 'UTF8'),
      'sha256'
    ),
    false
  )
  from vault.decrypted_secrets secret
  where secret.name = 'limm_whatsapp_worker_token'
  limit 1
$$;

revoke all on function public.verify_limm_scheduler_token(text) from public, anon, authenticated;
grant execute on function public.verify_limm_scheduler_token(text) to service_role;

create or replace function public.get_whatsapp_queue_health()
returns table (
  queued_count bigint,
  processing_count bigint,
  dead_letter_count bigint,
  stale_processing_count bigint,
  completed_last_24h_count bigint,
  retry_scheduled_last_24h_count bigint,
  oldest_queued_at timestamptz,
  oldest_queued_age_seconds integer,
  last_dead_letter_at timestamptz,
  worker_last_started_at timestamptz,
  worker_last_succeeded_at timestamptz,
  worker_last_failed_at timestamptz,
  worker_status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with queue as (
    select
      count(*) filter (where job.status = 'queued')::bigint as queued_count,
      count(*) filter (where job.status = 'processing')::bigint as processing_count,
      count(*) filter (where job.status = 'failed')::bigint as dead_letter_count,
      count(*) filter (
        where job.status = 'processing'
          and job.locked_at < now() - interval '5 minutes'
      )::bigint as stale_processing_count,
      count(*) filter (
        where job.status = 'completed'
          and job.completed_at >= now() - interval '24 hours'
      )::bigint as completed_last_24h_count,
      min(job.created_at) filter (where job.status = 'queued') as oldest_queued_at,
      coalesce(extract(epoch from now() - min(job.created_at) filter (where job.status = 'queued'))::integer, 0) as oldest_queued_age_seconds,
      max(job.dead_lettered_at) as last_dead_letter_at
    from public.whatsapp_inbound_jobs job
  ), retries as (
    select count(*)::bigint as retry_scheduled_last_24h_count
    from public.whatsapp_inbound_job_attempts attempt
    where attempt.outcome = 'retry_scheduled'
      and attempt.finished_at >= now() - interval '24 hours'
  )
  select
    queue.queued_count,
    queue.processing_count,
    queue.dead_letter_count,
    queue.stale_processing_count,
    queue.completed_last_24h_count,
    retries.retry_scheduled_last_24h_count,
    queue.oldest_queued_at,
    queue.oldest_queued_age_seconds,
    queue.last_dead_letter_at,
    heartbeat.last_started_at,
    heartbeat.last_succeeded_at,
    heartbeat.last_failed_at,
    coalesce(heartbeat.status, 'unknown')
  from queue
  cross join retries
  left join public.reliability_heartbeats heartbeat
    on heartbeat.service_name = 'whatsapp_queue_worker'
$$;

revoke all on function public.get_whatsapp_queue_health() from public, anon, authenticated;
grant execute on function public.get_whatsapp_queue_health() to service_role;

alter table public.lead_files
  add column if not exists content_sha256 text not null default '',
  add column if not exists integrity_status text not null default 'unverified'
    check (integrity_status in ('unverified','verified','missing','size_mismatch','checksum_mismatch','error')),
  add column if not exists integrity_verified_at timestamptz;

create table if not exists public.client_file_recovery_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('integrity','backup','restore_drill')),
  status text not null default 'running'
    check (status in ('running','succeeded','partial','failed','not_configured')),
  destination text not null default 'source_integrity',
  source_object_count integer not null default 0 check (source_object_count >= 0),
  processed_object_count integer not null default 0 check (processed_object_count >= 0),
  verified_object_count integer not null default 0 check (verified_object_count >= 0),
  copied_object_count integer not null default 0 check (copied_object_count >= 0),
  failed_object_count integer not null default 0 check (failed_object_count >= 0),
  source_bytes bigint not null default 0 check (source_bytes >= 0),
  copied_bytes bigint not null default 0 check (copied_bytes >= 0),
  manifest_key text not null default '',
  manifest_sha256 text not null default '',
  error_code text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.client_file_recovery_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.client_file_recovery_runs(id) on delete cascade,
  lead_file_id uuid references public.lead_files(id) on delete set null,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text not null default '',
  expected_size_bytes bigint not null default 0,
  observed_size_bytes bigint,
  expected_sha256 text not null default '',
  observed_sha256 text not null default '',
  backup_object_key text not null default '',
  status text not null
    check (status in ('verified','copied','missing','size_mismatch','checksum_mismatch','error','skipped')),
  error_code text not null default '',
  checked_at timestamptz not null default now(),
  unique (run_id, storage_bucket, storage_path)
);

create index if not exists client_file_recovery_runs_type_started_idx
  on public.client_file_recovery_runs (run_type, started_at desc);
create index if not exists client_file_recovery_items_run_idx
  on public.client_file_recovery_items (run_id, status);
create index if not exists client_file_recovery_items_lead_file_idx
  on public.client_file_recovery_items (lead_file_id)
  where lead_file_id is not null;

alter table public.client_file_recovery_runs enable row level security;
alter table public.client_file_recovery_items enable row level security;
revoke all on table public.client_file_recovery_runs from public, anon, authenticated;
revoke all on table public.client_file_recovery_items from public, anon, authenticated;
grant select, insert, update, delete on table public.client_file_recovery_runs to service_role;
grant select, insert, update, delete on table public.client_file_recovery_items to service_role;
drop policy if exists client_file_recovery_runs_service_role on public.client_file_recovery_runs;
create policy client_file_recovery_runs_service_role on public.client_file_recovery_runs
for all to service_role using (true) with check (true);
drop policy if exists client_file_recovery_items_service_role on public.client_file_recovery_items;
create policy client_file_recovery_items_service_role on public.client_file_recovery_items
for all to service_role using (true) with check (true);

create schema if not exists limm_private;
revoke all on schema limm_private from public, anon, authenticated;

create or replace function limm_private.dispatch_reliability_endpoint(
  p_service_name text,
  p_url_secret_name text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
  v_request_id bigint;
begin
  select secret.decrypted_secret into v_url
  from vault.decrypted_secrets secret
  where secret.name = p_url_secret_name
  limit 1;

  select secret.decrypted_secret into v_token
  from vault.decrypted_secrets secret
  where secret.name = 'limm_whatsapp_worker_token'
  limit 1;

  if nullif(v_url, '') is null or nullif(v_token, '') is null then
    insert into public.reliability_dispatches (
      service_name, status, error_code
    ) values (
      left(coalesce(p_service_name, 'unknown_service'), 100), 'configuration_error', 'scheduler_vault_secret_missing'
    );
    return null;
  end if;

  select net.http_get(
    url := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'User-Agent', 'LIMM-Supabase-Reliability-Scheduler/11.3'
    ),
    timeout_milliseconds := 25000
  ) into v_request_id;

  insert into public.reliability_dispatches (
    service_name, request_id, status
  ) values (
    left(coalesce(p_service_name, 'unknown_service'), 100), v_request_id, 'dispatched'
  );
  return v_request_id;
exception when others then
  insert into public.reliability_dispatches (
    service_name, status, error_code
  ) values (
    left(coalesce(p_service_name, 'unknown_service'), 100), 'configuration_error', left(sqlstate, 100)
  );
  return null;
end;
$$;

revoke all on function limm_private.dispatch_reliability_endpoint(text,text) from public, anon, authenticated;

create or replace function limm_private.dispatch_whatsapp_worker()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select limm_private.dispatch_reliability_endpoint(
    'whatsapp_queue_worker',
    'limm_whatsapp_worker_url'
  )
$$;

revoke all on function limm_private.dispatch_whatsapp_worker() from public, anon, authenticated;

create or replace function limm_private.dispatch_client_file_integrity()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select limm_private.dispatch_reliability_endpoint(
    'client_file_integrity',
    'limm_client_file_integrity_url'
  )
$$;

revoke all on function limm_private.dispatch_client_file_integrity() from public, anon, authenticated;

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

  return jsonb_build_object(
    'completedJobsDeleted', v_completed_deleted,
    'deadLettersDeleted', v_dead_letters_deleted,
    'dispatchesDeleted', v_dispatches_deleted
  );
end;
$$;

revoke all on function limm_private.prune_reliability_history() from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'limm-reliability-retention' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'limm-reliability-retention',
    '40 19 * * *',
    'select limm_private.prune_reliability_history();'
  );
end $$;

comment on table public.whatsapp_inbound_job_attempts is
  'v11.3 append-only durable inbound attempt evidence, including expired-lease recovery.';
comment on table public.reliability_heartbeats is
  'v11.3 service-only worker heartbeat and recovery telemetry.';
comment on table public.client_file_recovery_runs is
  'v11.3 auditable source-integrity, offsite-backup, and restore-drill run evidence.';
