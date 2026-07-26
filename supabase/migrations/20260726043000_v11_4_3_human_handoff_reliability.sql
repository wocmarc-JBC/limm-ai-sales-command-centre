-- v11.4.3 durable human-handoff reliability.

create table if not exists public.human_handoff_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  dedupe_key text not null unique,
  reasons text[] not null default '{}',
  latest_message_preview text not null default '',
  trace_id text not null default '',
  status text not null default 'reserved' check (status in ('reserved','sent','delivery_failed','disabled','provider_not_configured')),
  provider text not null default '',
  provider_message_id text not null default '',
  error_code text not null default '',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  first_triggered_at timestamptz not null default now(),
  last_triggered_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists human_handoff_events_lead_time_idx
  on public.human_handoff_events (lead_id, last_triggered_at desc);

alter table public.human_handoff_events enable row level security;
revoke all on table public.human_handoff_events from public, anon, authenticated;
grant select, insert, update, delete on table public.human_handoff_events to service_role;

create or replace function public.reserve_human_handoff(
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
  perform pg_advisory_xact_lock(hashtextextended('human_handoff:' || p_dedupe_key, 0));

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
      bot_paused = true,
      bot_paused_at = coalesce(bot_paused_at, v_now),
      bot_paused_by = 'human_handoff_guard',
      bot_pause_reason = left(coalesce(array_to_string(p_reasons, ' + '), 'Human follow-up required'), 500),
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

revoke all on function public.reserve_human_handoff(uuid,text,text[],text,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_human_handoff(uuid,text,text[],text,text,integer) to service_role;

create or replace function public.complete_human_handoff(
  p_event_id uuid,
  p_status text,
  p_provider text,
  p_provider_message_id text,
  p_error_code text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.human_handoff_events
  set status = case when p_status in ('sent','delivery_failed','disabled','provider_not_configured') then p_status else 'delivery_failed' end,
      provider = left(coalesce(p_provider, ''), 100),
      provider_message_id = left(coalesce(p_provider_message_id, ''), 300),
      error_code = left(coalesce(p_error_code, ''), 200),
      sent_at = case when p_status = 'sent' then now() else sent_at end,
      updated_at = now()
  where id = p_event_id;
  return found;
end
$$;

revoke all on function public.complete_human_handoff(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.complete_human_handoff(uuid,text,text,text,text) to service_role;

create or replace function public.human_handoff_reliability_schema_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select to_regclass('public.human_handoff_events') is not null
    and to_regprocedure('public.reserve_human_handoff(uuid,text,text[],text,text,integer)') is not null
    and to_regprocedure('public.complete_human_handoff(uuid,text,text,text,text)') is not null;
$$;

revoke all on function public.human_handoff_reliability_schema_ready() from public, anon, authenticated;
grant execute on function public.human_handoff_reliability_schema_ready() to service_role;
