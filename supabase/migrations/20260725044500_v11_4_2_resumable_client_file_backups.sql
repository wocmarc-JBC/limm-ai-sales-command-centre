-- v11.4.2: resumable, paginated client-file offsite backups.
-- The queue is snapshotted in PostgreSQL, each file is checkpointed independently,
-- a short lease prevents overlapping workers, and pg_cron dispatches continuations.

alter table public.client_file_recovery_runs
  add column if not exists inventory_snapshot_at timestamptz,
  add column if not exists batch_count integer not null default 0,
  add column if not exists last_progress_at timestamptz,
  add column if not exists continuation_required boolean not null default false,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz;

update public.client_file_recovery_runs
set inventory_snapshot_at = coalesce(inventory_snapshot_at, started_at, created_at, now()),
    last_progress_at = coalesce(last_progress_at, completed_at, started_at, created_at, now())
where inventory_snapshot_at is null
   or last_progress_at is null;

alter table public.client_file_recovery_runs
  alter column inventory_snapshot_at set default now(),
  alter column inventory_snapshot_at set not null,
  alter column last_progress_at set default now(),
  alter column last_progress_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_file_recovery_runs'::regclass
      and conname = 'client_file_recovery_runs_batch_count_check'
  ) then
    alter table public.client_file_recovery_runs
      add constraint client_file_recovery_runs_batch_count_check check (batch_count >= 0);
  end if;
end
$$;

alter table public.client_file_recovery_items
  add column if not exists source_uploaded_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz;

update public.client_file_recovery_items item
set source_uploaded_at = coalesce(file.uploaded_at, item.checked_at)
from public.lead_files file
where item.lead_file_id = file.id
  and item.source_uploaded_at is null;

update public.client_file_recovery_items
set source_uploaded_at = checked_at
where source_uploaded_at is null;

alter table public.client_file_recovery_items
  alter column source_uploaded_at set default now(),
  alter column source_uploaded_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_file_recovery_items'::regclass
      and conname = 'client_file_recovery_items_attempt_count_check'
  ) then
    alter table public.client_file_recovery_items
      add constraint client_file_recovery_items_attempt_count_check check (attempt_count >= 0);
  end if;
end
$$;

alter table public.client_file_recovery_items
  drop constraint if exists client_file_recovery_items_status_check;

alter table public.client_file_recovery_items
  add constraint client_file_recovery_items_status_check
  check (status in (
    'pending', 'verified', 'copied', 'missing', 'size_mismatch',
    'checksum_mismatch', 'error', 'skipped'
  ));

-- Fail duplicate historical running rows before enforcing one active backup run.
with ranked as (
  select id,
         row_number() over (order by started_at desc, id desc) as position
  from public.client_file_recovery_runs
  where run_type = 'backup'
    and status = 'running'
)
update public.client_file_recovery_runs run
set status = 'failed',
    error_code = 'superseded_duplicate_running_backup',
    continuation_required = false,
    lease_token = null,
    lease_expires_at = null,
    completed_at = coalesce(run.completed_at, now()),
    last_progress_at = now(),
    metadata = run.metadata || jsonb_build_object(
      'finalizedBy', 'v11_4_2_resumable_backup_migration',
      'finalizedAt', now()
    )
from ranked
where run.id = ranked.id
  and ranked.position > 1;

create unique index if not exists client_file_recovery_one_running_backup_idx
  on public.client_file_recovery_runs (run_type)
  where run_type = 'backup' and status = 'running';

create index if not exists client_file_recovery_runs_backup_progress_idx
  on public.client_file_recovery_runs (status, continuation_required, last_progress_at)
  where run_type = 'backup';

create index if not exists client_file_recovery_items_pending_idx
  on public.client_file_recovery_items (run_id, status, source_uploaded_at, id);

create index if not exists lead_files_recovery_inventory_idx
  on public.lead_files (uploaded_at, id)
  where file_status <> 'voided' and file_size_bytes > 0;

create or replace function public.start_or_resume_client_file_backup(
  p_destination text
)
returns table (
  run_id uuid,
  created boolean,
  source_object_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_source_count integer := 0;
  v_source_bytes bigint := 0;
  v_snapshot_at timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended('limm_client_file_backup_start', 0));

  select run.id, run.source_object_count
  into v_run_id, v_source_count
  from public.client_file_recovery_runs run
  where run.run_type = 'backup'
    and run.status = 'running'
  order by run.started_at asc, run.id asc
  limit 1
  for update;

  if v_run_id is not null then
    return query select v_run_id, false, v_source_count;
    return;
  end if;

  insert into public.client_file_recovery_runs (
    run_type,
    status,
    destination,
    inventory_snapshot_at,
    last_progress_at,
    continuation_required,
    metadata
  ) values (
    'backup',
    'running',
    coalesce(nullif(p_destination, ''), 's3-compatible'),
    v_snapshot_at,
    v_snapshot_at,
    true,
    jsonb_build_object(
      'schemaVersion', 'limm-client-file-backup-run-v2',
      'inventorySnapshotAt', v_snapshot_at,
      'fullInventoryQueued', false,
      'contentAddressedObjects', true,
      'continuationScheduler', 'pg_cron_minute'
    )
  )
  returning id into v_run_id;

  insert into public.client_file_recovery_items (
    run_id,
    lead_file_id,
    storage_bucket,
    storage_path,
    mime_type,
    expected_size_bytes,
    observed_size_bytes,
    expected_sha256,
    observed_sha256,
    backup_object_key,
    status,
    error_code,
    source_uploaded_at,
    attempt_count,
    last_attempt_at,
    checked_at
  )
  select
    v_run_id,
    file.id,
    file.storage_bucket,
    file.storage_path,
    file.mime_type,
    file.file_size_bytes,
    null,
    file.content_sha256,
    '',
    '',
    'pending',
    '',
    file.uploaded_at,
    0,
    null,
    v_snapshot_at
  from public.lead_files file
  where file.file_status <> 'voided'
    and file.file_size_bytes > 0
    and file.uploaded_at <= v_snapshot_at
  order by file.uploaded_at asc, file.id asc
  on conflict (run_id, storage_bucket, storage_path) do nothing;

  select count(*)::integer, coalesce(sum(item.expected_size_bytes), 0)::bigint
  into v_source_count, v_source_bytes
  from public.client_file_recovery_items item
  where item.run_id = v_run_id;

  update public.client_file_recovery_runs run
  set source_object_count = v_source_count,
      source_bytes = v_source_bytes,
      continuation_required = v_source_count > 0,
      metadata = run.metadata || jsonb_build_object(
        'fullInventoryQueued', true,
        'queuedObjectCount', v_source_count,
        'queuedSourceBytes', v_source_bytes
      )
  where run.id = v_run_id;

  return query select v_run_id, true, v_source_count;
end
$$;

revoke all on function public.start_or_resume_client_file_backup(text) from public, anon, authenticated;
grant execute on function public.start_or_resume_client_file_backup(text) to service_role;

create or replace function public.claim_client_file_backup_run(
  p_run_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 55
)
returns table (
  run_id uuid,
  source_object_count integer,
  processed_object_count integer,
  copied_object_count integer,
  failed_object_count integer,
  batch_count integer,
  inventory_snapshot_at timestamptz,
  metadata jsonb
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  update public.client_file_recovery_runs run
  set lease_token = p_lease_token,
      lease_expires_at = now() + make_interval(secs => greatest(15, least(coalesce(p_lease_seconds, 55), 240))),
      last_progress_at = greatest(run.last_progress_at, now())
  where run.id = p_run_id
    and run.run_type = 'backup'
    and run.status = 'running'
    and (
      run.lease_token = p_lease_token
      or run.lease_expires_at is null
      or run.lease_expires_at < now()
    )
  returning
    run.id,
    run.source_object_count,
    run.processed_object_count,
    run.copied_object_count,
    run.failed_object_count,
    run.batch_count,
    run.inventory_snapshot_at,
    run.metadata;
end
$$;

revoke all on function public.claim_client_file_backup_run(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_client_file_backup_run(uuid, uuid, integer) to service_role;

create or replace function public.refresh_client_file_backup_progress(
  p_run_id uuid,
  p_lease_token uuid,
  p_batch_duration_ms integer,
  p_batch_processed_count integer,
  p_newly_copied_count integer
)
returns table (
  pending_object_count integer,
  processed_object_count integer,
  copied_object_count integer,
  failed_object_count integer,
  copied_bytes bigint,
  batch_count integer,
  metadata jsonb
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pending integer := 0;
  v_processed integer := 0;
  v_copied integer := 0;
  v_failed integer := 0;
  v_copied_bytes bigint := 0;
  v_batch_count integer := 0;
  v_metadata jsonb := '{}'::jsonb;
  v_previous_newly_copied integer := 0;
  v_previous_max_duration integer := 0;
begin
  select
    count(*) filter (where item.status = 'pending')::integer,
    count(*) filter (where item.status <> 'pending')::integer,
    count(*) filter (where item.status = 'copied')::integer,
    count(*) filter (where item.status in ('missing', 'size_mismatch', 'checksum_mismatch', 'error'))::integer,
    coalesce(sum(item.observed_size_bytes) filter (where item.status = 'copied'), 0)::bigint
  into v_pending, v_processed, v_copied, v_failed, v_copied_bytes
  from public.client_file_recovery_items item
  where item.run_id = p_run_id;

  select
    case when coalesce(run.metadata ->> 'newlyCopiedCount', '') ~ '^[0-9]+$'
      then (run.metadata ->> 'newlyCopiedCount')::integer else 0 end,
    case when coalesce(run.metadata ->> 'maxBatchDurationMs', '') ~ '^[0-9]+$'
      then (run.metadata ->> 'maxBatchDurationMs')::integer else 0 end
  into v_previous_newly_copied, v_previous_max_duration
  from public.client_file_recovery_runs run
  where run.id = p_run_id;

  update public.client_file_recovery_runs run
  set processed_object_count = v_processed,
      verified_object_count = v_copied,
      copied_object_count = v_copied,
      failed_object_count = v_failed,
      copied_bytes = v_copied_bytes,
      batch_count = run.batch_count + 1,
      last_progress_at = now(),
      continuation_required = v_pending > 0,
      lease_token = null,
      lease_expires_at = null,
      metadata = run.metadata || jsonb_build_object(
        'lastBatchDurationMs', greatest(coalesce(p_batch_duration_ms, 0), 0),
        'maxBatchDurationMs', greatest(v_previous_max_duration, greatest(coalesce(p_batch_duration_ms, 0), 0)),
        'lastBatchProcessedCount', greatest(coalesce(p_batch_processed_count, 0), 0),
        'newlyCopiedCount', v_previous_newly_copied + greatest(coalesce(p_newly_copied_count, 0), 0),
        'pendingObjectCount', v_pending,
        'fullInventoryProcessed', v_pending = 0,
        'fullCoverageProven', v_pending = 0 and v_failed = 0 and v_copied = run.source_object_count,
        'contentAddressedObjects', true,
        'continuationRequired', v_pending > 0
      )
  where run.id = p_run_id
    and run.run_type = 'backup'
    and run.status = 'running'
    and run.lease_token = p_lease_token
  returning run.batch_count, run.metadata
  into v_batch_count, v_metadata;

  if not found then
    return;
  end if;

  return query
  select v_pending, v_processed, v_copied, v_failed, v_copied_bytes, v_batch_count, v_metadata;
end
$$;

revoke all on function public.refresh_client_file_backup_progress(uuid, uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.refresh_client_file_backup_progress(uuid, uuid, integer, integer, integer) to service_role;

create or replace function public.get_client_file_backup_coverage()
returns table (
  active_object_count bigint,
  protected_object_count bigint,
  uncovered_object_count bigint,
  oldest_uncovered_at timestamptz,
  latest_successful_backup_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest as (
    select run.id
    from public.client_file_recovery_runs run
    where run.run_type = 'backup'
      and run.status = 'succeeded'
      and run.source_object_count = run.processed_object_count
      and run.processed_object_count = run.copied_object_count
      and run.failed_object_count = 0
      and run.manifest_sha256 ~ '^[a-f0-9]{64}$'
    order by run.completed_at desc
    limit 1
  ), active as (
    select file.id, file.uploaded_at
    from public.lead_files file
    where file.file_status <> 'voided'
      and file.file_size_bytes > 0
  )
  select
    count(*)::bigint,
    count(*) filter (
      where exists (
        select 1
        from public.client_file_recovery_items item
        where item.run_id = (select latest.id from latest)
          and item.lead_file_id = active.id
          and item.status = 'copied'
      )
    )::bigint,
    count(*) filter (
      where not exists (
        select 1
        from public.client_file_recovery_items item
        where item.run_id = (select latest.id from latest)
          and item.lead_file_id = active.id
          and item.status = 'copied'
      )
    )::bigint,
    min(active.uploaded_at) filter (
      where not exists (
        select 1
        from public.client_file_recovery_items item
        where item.run_id = (select latest.id from latest)
          and item.lead_file_id = active.id
          and item.status = 'copied'
      )
    ),
    (select latest.id from latest)
  from active;
$$;

revoke all on function public.get_client_file_backup_coverage() from public, anon, authenticated;
grant execute on function public.get_client_file_backup_coverage() to service_role;

create or replace function limm_private.dispatch_client_file_backup_continuation()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
  v_run_id uuid;
  v_request_id bigint;
begin
  select run.id
  into v_run_id
  from public.client_file_recovery_runs run
  where run.run_type = 'backup'
    and run.status = 'running'
    and run.continuation_required = true
    and (run.lease_expires_at is null or run.lease_expires_at < now())
  order by run.started_at asc, run.id asc
  limit 1;

  if v_run_id is null then
    return null;
  end if;

  select secret.decrypted_secret
  into v_url
  from vault.decrypted_secrets secret
  where secret.name = 'limm_client_file_backup_url'
  limit 1;

  select secret.decrypted_secret
  into v_token
  from vault.decrypted_secrets secret
  where secret.name = 'limm_whatsapp_worker_token'
  limit 1;

  if nullif(v_url, '') is null or nullif(v_token, '') is null then
    insert into public.reliability_dispatches (service_name, status, error_code)
    values ('client_file_backup_continuation', 'configuration_error', 'scheduler_vault_secret_missing');
    return null;
  end if;

  select net.http_get(
    url := v_url,
    params := jsonb_build_object(
      'mode', 'continue',
      'run_id', v_run_id::text
    ),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'User-Agent', 'LIMM-Supabase-Recovery-Scheduler/11.4.2'
    ),
    timeout_milliseconds := 55000
  ) into v_request_id;

  insert into public.reliability_dispatches (service_name, request_id, status)
  values ('client_file_backup_continuation', v_request_id, 'dispatched');

  return v_request_id;
exception when others then
  insert into public.reliability_dispatches (service_name, status, error_code)
  values ('client_file_backup_continuation', 'configuration_error', left(sqlstate, 100));
  return null;
end
$$;

revoke all on function limm_private.dispatch_client_file_backup_continuation() from public, anon, authenticated;
grant execute on function limm_private.dispatch_client_file_backup_continuation() to service_role;

-- The dispatcher is a no-op when no continuation is required.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'limm-client-file-backup-continuation-minute') then
    update cron.job
    set schedule = '* * * * *',
        command = 'select limm_private.dispatch_client_file_backup_continuation();',
        active = true
    where jobname = 'limm-client-file-backup-continuation-minute';
  else
    perform cron.schedule(
      'limm-client-file-backup-continuation-minute',
      '* * * * *',
      'select limm_private.dispatch_client_file_backup_continuation();'
    );
  end if;
end
$$;

create or replace function public.client_file_resumable_backup_schema_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'client_file_recovery_runs'
        and column_name = 'last_progress_at'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'client_file_recovery_runs'
        and column_name = 'continuation_required'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'client_file_recovery_items'
        and column_name = 'attempt_count'
    )
    and to_regprocedure('public.start_or_resume_client_file_backup(text)') is not null
    and to_regprocedure('public.claim_client_file_backup_run(uuid,uuid,integer)') is not null
    and to_regprocedure('public.refresh_client_file_backup_progress(uuid,uuid,integer,integer,integer)') is not null
    and to_regprocedure('public.get_client_file_backup_coverage()') is not null
    and to_regprocedure('limm_private.dispatch_client_file_backup_continuation()') is not null
    and exists (
      select 1 from cron.job
      where jobname = 'limm-client-file-backup-continuation-minute'
        and active = true
    );
$$;

revoke all on function public.client_file_resumable_backup_schema_ready() from public, anon, authenticated;
grant execute on function public.client_file_resumable_backup_schema_ready() to service_role;
