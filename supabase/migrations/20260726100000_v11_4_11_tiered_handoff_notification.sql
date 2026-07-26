-- v11.4.11 durable notification-only handoff reservation.
-- Preserves the original reserve_human_handoff pause contract for urgent cases,
-- while qualified sales notifications mark Needs Marcus without pausing the bot.

create or replace function public.reserve_human_handoff_notification(
  p_lead_id uuid,
  p_dedupe_key text,
  p_reasons text[],
  p_latest_message_preview text,
  p_trace_id text,
  p_cooldown_seconds integer default 1800
)
returns table (reserved boolean, event_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event public.human_handoff_events%rowtype;
  v_now timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtextextended('human_handoff_notification:' || p_dedupe_key, 0));

  select * into v_event
  from public.human_handoff_events
  where dedupe_key = p_dedupe_key
  for update;

  if found and v_event.last_triggered_at > v_now - make_interval(secs => greatest(60, least(coalesce(p_cooldown_seconds, 1800), 86400))) then
    return query select false, v_event.id;
    return;
  end if;

  update public.leads
  set needs_marcus = true,
      updated_at = v_now
  where id = p_lead_id;

  insert into public.human_handoff_events (
    lead_id, dedupe_key, reasons, latest_message_preview, trace_id,
    status, attempt_count, first_triggered_at, last_triggered_at, updated_at
  ) values (
    p_lead_id, p_dedupe_key, coalesce(p_reasons, '{}'), left(coalesce(p_latest_message_preview, ''), 500),
    left(coalesce(p_trace_id, ''), 200), 'reserved', 1, v_now, v_now, v_now
  )
  on conflict (dedupe_key) do update
  set lead_id = excluded.lead_id,
      reasons = excluded.reasons,
      latest_message_preview = excluded.latest_message_preview,
      trace_id = excluded.trace_id,
      status = 'reserved',
      provider_message_id = '',
      error_code = '',
      attempt_count = public.human_handoff_events.attempt_count + 1,
      last_triggered_at = v_now,
      updated_at = v_now
  returning * into v_event;

  return query select true, v_event.id;
end
$$;

revoke all on function public.reserve_human_handoff_notification(uuid,text,text[],text,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_human_handoff_notification(uuid,text,text[],text,text,integer) to service_role;
