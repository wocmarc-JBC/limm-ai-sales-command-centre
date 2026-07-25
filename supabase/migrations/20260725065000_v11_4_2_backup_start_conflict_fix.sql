-- Fix PostgreSQL ambiguity between the start RPC's output column `run_id`
-- and client_file_recovery_items.run_id. The named constraint is unambiguous
-- and preserves idempotent inventory queue creation.

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
  on conflict on constraint client_file_recovery_items_run_id_storage_bucket_storage_pa_key
  do nothing;

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
        'queuedSourceBytes', v_source_bytes,
        'queueConflictTarget', 'client_file_recovery_items_run_id_storage_bucket_storage_pa_key'
      )
  where run.id = v_run_id;

  return query select v_run_id, true, v_source_count;
end
$$;

revoke all on function public.start_or_resume_client_file_backup(text) from public, anon, authenticated;
grant execute on function public.start_or_resume_client_file_backup(text) to service_role;
