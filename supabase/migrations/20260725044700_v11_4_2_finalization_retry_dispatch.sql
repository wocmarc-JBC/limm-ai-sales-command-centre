-- Keep continuation armed while the final manifest and terminal run evidence are being written.
-- If a worker stops after the queue reaches zero but before finalization commits,
-- the minute dispatcher retries after the short finalization lease expires.

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
      continuation_required = true,
      lease_token = case when v_pending > 0 then null else p_lease_token end,
      lease_expires_at = case
        when v_pending > 0 then null
        else now() + make_interval(secs => 55)
      end,
      metadata = run.metadata || jsonb_build_object(
        'lastBatchDurationMs', greatest(coalesce(p_batch_duration_ms, 0), 0),
        'maxBatchDurationMs', greatest(v_previous_max_duration, greatest(coalesce(p_batch_duration_ms, 0), 0)),
        'lastBatchProcessedCount', greatest(coalesce(p_batch_processed_count, 0), 0),
        'newlyCopiedCount', v_previous_newly_copied + greatest(coalesce(p_newly_copied_count, 0), 0),
        'pendingObjectCount', v_pending,
        'fullInventoryProcessed', v_pending = 0,
        'fullCoverageProven', v_pending = 0 and v_failed = 0 and v_copied = run.source_object_count,
        'contentAddressedObjects', true,
        'continuationRequired', true,
        'finalizationRequired', v_pending = 0,
        'finalizationRetryArmed', v_pending = 0
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
