-- v11.1 World-Class Operations
-- Additive team-inbox coordination, private realtime signals, observability,
-- measurable AI quality, product analytics, and distributed rate limiting.

alter table public.leads
  add column if not exists first_operator_response_at timestamptz;

create table if not exists public.inbox_assignments (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  assigned_profile_id uuid references public.profiles(id) on delete set null,
  assigned_name text not null default '',
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0)
);

create index if not exists inbox_assignments_profile_lease_idx
  on public.inbox_assignments (assigned_profile_id, lease_expires_at desc);

create table if not exists public.inbox_internal_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  mentions text[] not null default '{}',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists inbox_internal_notes_lead_created_idx
  on public.inbox_internal_notes (lead_id, created_at desc);

create table if not exists public.operational_trace_events (
  id uuid primary key default gen_random_uuid(),
  trace_id text not null check (char_length(trace_id) between 8 and 128),
  lead_id uuid references public.leads(id) on delete set null,
  event_name text not null,
  stage text not null default '',
  status text not null check (status in ('started', 'ok', 'degraded', 'failed')),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  provider_message_id_hash text not null default '',
  error_code text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists operational_trace_events_trace_created_idx
  on public.operational_trace_events (trace_id, created_at desc);
create index if not exists operational_trace_events_status_created_idx
  on public.operational_trace_events (status, created_at desc);

create table if not exists public.ai_reply_quality_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  message_id uuid references public.lead_messages(id) on delete set null,
  trace_id text not null default '',
  model_version text not null,
  prompt_version text not null,
  planner_version text not null,
  reply_signature text not null default '',
  primary_move text not null default '',
  quality_scores jsonb not null default '{}'::jsonb,
  shadow_candidate boolean not null default false,
  decision text not null default 'observed' check (decision in ('observed', 'accepted', 'edited', 'rejected', 'unsafe')),
  operator_feedback text not null default '',
  edit_distance integer check (edit_distance is null or edit_distance >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

create index if not exists ai_reply_quality_events_version_created_idx
  on public.ai_reply_quality_events (planner_version, created_at desc);
create index if not exists ai_reply_quality_events_decision_created_idx
  on public.ai_reply_quality_events (decision, created_at desc);

create table if not exists public.operator_product_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  session_id text not null default '',
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists operator_product_events_name_created_idx
  on public.operator_product_events (event_name, created_at desc);

create table if not exists public.api_rate_limit_windows (
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (key_hash, window_started_at)
);

create index if not exists api_rate_limit_windows_updated_idx
  on public.api_rate_limit_windows (updated_at);

alter table public.inbox_assignments enable row level security;
alter table public.inbox_internal_notes enable row level security;
alter table public.operational_trace_events enable row level security;
alter table public.ai_reply_quality_events enable row level security;
alter table public.operator_product_events enable row level security;
alter table public.api_rate_limit_windows enable row level security;

revoke all on table public.inbox_assignments from public, anon, authenticated;
revoke all on table public.inbox_internal_notes from public, anon;
revoke all on table public.operational_trace_events from public, anon, authenticated;
revoke all on table public.ai_reply_quality_events from public, anon, authenticated;
revoke all on table public.operator_product_events from public, anon, authenticated;
revoke all on table public.api_rate_limit_windows from public, anon, authenticated;

grant select on table public.inbox_assignments to authenticated;
grant select, insert, update, delete on table public.inbox_internal_notes to authenticated;
grant all on table public.operational_trace_events to service_role;
grant all on table public.ai_reply_quality_events to service_role;
grant all on table public.operator_product_events to service_role;
grant all on table public.api_rate_limit_windows to service_role;

drop policy if exists inbox_assignments_select_roles on public.inbox_assignments;
create policy inbox_assignments_select_roles on public.inbox_assignments
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists inbox_assignments_insert_roles on public.inbox_assignments;
create policy inbox_assignments_insert_roles on public.inbox_assignments
for insert to authenticated
with check (
  public.current_user_is_any(array['boss','admin','sales'])
  and (
    assigned_profile_id = auth.uid()
    or public.current_user_is_any(array['boss','admin'])
  )
);

drop policy if exists inbox_assignments_update_roles on public.inbox_assignments;
create policy inbox_assignments_update_roles on public.inbox_assignments
for update to authenticated
using (
  assigned_profile_id = auth.uid()
  or assigned_profile_id is null
  or coalesce(lease_expires_at, '-infinity'::timestamptz) <= now()
  or public.current_user_is_any(array['boss','admin'])
)
with check (
  assigned_profile_id = auth.uid()
  or assigned_profile_id is null
  or public.current_user_is_any(array['boss','admin'])
);

drop policy if exists inbox_assignments_delete_roles on public.inbox_assignments;
create policy inbox_assignments_delete_roles on public.inbox_assignments
for delete to authenticated
using (assigned_profile_id = auth.uid() or public.current_user_is_any(array['boss','admin']));

drop policy if exists inbox_internal_notes_select_roles on public.inbox_internal_notes;
create policy inbox_internal_notes_select_roles on public.inbox_internal_notes
for select to authenticated
using (
  public.current_user_is_any(array['boss','admin','viewer'])
  or (
    public.current_user_is_any(array['sales'])
    and exists (select 1 from public.leads where public.leads.id = inbox_internal_notes.lead_id)
  )
);

drop policy if exists inbox_internal_notes_insert_roles on public.inbox_internal_notes;
create policy inbox_internal_notes_insert_roles on public.inbox_internal_notes
for insert to authenticated
with check (
  public.current_user_is_any(array['boss','admin','sales'])
  and created_by = auth.uid()
  and exists (select 1 from public.leads where public.leads.id = inbox_internal_notes.lead_id)
);

drop policy if exists inbox_internal_notes_update_roles on public.inbox_internal_notes;
create policy inbox_internal_notes_update_roles on public.inbox_internal_notes
for update to authenticated
using (
  public.current_user_is_any(array['boss','admin'])
  or (created_by = auth.uid() and exists (select 1 from public.leads where public.leads.id = inbox_internal_notes.lead_id))
)
with check (
  public.current_user_is_any(array['boss','admin'])
  or (created_by = auth.uid() and exists (select 1 from public.leads where public.leads.id = inbox_internal_notes.lead_id))
);

drop policy if exists inbox_internal_notes_delete_roles on public.inbox_internal_notes;
create policy inbox_internal_notes_delete_roles on public.inbox_internal_notes
for delete to authenticated
using (
  public.current_user_is_any(array['boss','admin'])
  or (created_by = auth.uid() and exists (select 1 from public.leads where public.leads.id = inbox_internal_notes.lead_id))
);

-- Assignment-aware rollout policy: unassigned work remains visible to sales,
-- active work owned by somebody else does not. Boss/admin retain the team view;
-- viewer remains read-only through the existing mutation policies.
drop policy if exists leads_select_roles on public.leads;
create policy leads_select_roles on public.leads
for select to authenticated
using (
  public.current_user_is_any(array['boss','admin','viewer'])
  or (
    public.current_user_is_any(array['sales'])
    and not exists (
      select 1 from public.inbox_assignments assignment
      where assignment.lead_id = leads.id
        and assignment.assigned_profile_id is not null
        and coalesce(assignment.lease_expires_at, '-infinity'::timestamptz) > now()
        and assignment.assigned_profile_id <> auth.uid()
    )
  )
);

-- Remove the v3 permissive name as well as the v11 name. PostgreSQL ORs
-- permissive policies, so retaining leads_update_staff would bypass ownership.
drop policy if exists leads_update_staff on public.leads;
drop policy if exists leads_update_roles on public.leads;
create policy leads_update_roles on public.leads
for update to authenticated
using (
  public.current_user_is_any(array['boss','admin'])
  or (
    public.current_user_is_any(array['sales'])
    and not exists (
      select 1 from public.inbox_assignments assignment
      where assignment.lead_id = leads.id
        and assignment.assigned_profile_id is not null
        and coalesce(assignment.lease_expires_at, '-infinity'::timestamptz) > now()
        and assignment.assigned_profile_id <> auth.uid()
    )
  )
)
with check (
  public.current_user_is_any(array['boss','admin'])
  or (
    public.current_user_is_any(array['sales'])
    and not exists (
      select 1 from public.inbox_assignments assignment
      where assignment.lead_id = leads.id
        and assignment.assigned_profile_id is not null
        and coalesce(assignment.lease_expires_at, '-infinity'::timestamptz) > now()
        and assignment.assigned_profile_id <> auth.uid()
    )
  )
);

drop policy if exists lead_messages_select_roles on public.lead_messages;
create policy lead_messages_select_roles on public.lead_messages
for select to authenticated
using (
  public.current_user_is_any(array['boss','admin','viewer'])
  or (
    public.current_user_is_any(array['sales'])
    and exists (select 1 from public.leads where public.leads.id = lead_messages.lead_id)
  )
);

-- Remove the v3 permissive insert policy before installing the ownership-aware
-- equivalent; otherwise either policy could independently authorize the row.
drop policy if exists lead_messages_insert_staff on public.lead_messages;
drop policy if exists lead_messages_insert_roles on public.lead_messages;
create policy lead_messages_insert_roles on public.lead_messages
for insert to authenticated
with check (
  public.current_user_is_any(array['boss','admin'])
  or (
    public.current_user_is_any(array['sales'])
    and exists (select 1 from public.leads where public.leads.id = lead_messages.lead_id)
  )
);

create or replace function public.claim_inbox_conversation(
  p_lead_id uuid,
  p_lease_minutes integer default 30
)
returns table(
  claimed boolean,
  assigned_profile_id uuid,
  assigned_name text,
  lease_expires_at timestamptz,
  version bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_assignment public.inbox_assignments%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid() and active = true
  limit 1;

  if v_profile.id is null or v_profile.role not in ('boss', 'admin', 'sales') then
    raise exception 'active boss, admin, or sales profile required';
  end if;

  insert into public.inbox_assignments (
    lead_id, assigned_profile_id, assigned_name, claimed_at,
    lease_expires_at, updated_at, version
  ) values (
    p_lead_id, v_profile.id, coalesce(v_profile.full_name, v_profile.email, 'Operator'), v_now,
    v_now + make_interval(mins => greatest(5, least(p_lease_minutes, 120))), v_now, 1
  )
  on conflict (lead_id) do update
  set assigned_profile_id = excluded.assigned_profile_id,
      assigned_name = excluded.assigned_name,
      claimed_at = case
        when public.inbox_assignments.assigned_profile_id = excluded.assigned_profile_id
          then coalesce(public.inbox_assignments.claimed_at, excluded.claimed_at)
        else excluded.claimed_at
      end,
      lease_expires_at = excluded.lease_expires_at,
      updated_at = excluded.updated_at,
      version = public.inbox_assignments.version + 1
  where public.inbox_assignments.assigned_profile_id is null
     or public.inbox_assignments.assigned_profile_id = excluded.assigned_profile_id
     or coalesce(public.inbox_assignments.lease_expires_at, '-infinity'::timestamptz) <= v_now
  returning * into v_assignment;

  if v_assignment.lead_id is null then
    select * into v_assignment
    from public.inbox_assignments
    where lead_id = p_lead_id;
    return query select false, v_assignment.assigned_profile_id,
      v_assignment.assigned_name, v_assignment.lease_expires_at, v_assignment.version;
    return;
  end if;

  update public.leads
  set assigned_to = v_assignment.assigned_name,
      lead_owner = v_assignment.assigned_name,
      updated_at = v_now
  where id = p_lead_id;

  return query select true, v_assignment.assigned_profile_id,
    v_assignment.assigned_name, v_assignment.lease_expires_at, v_assignment.version;
end;
$$;

create or replace function public.release_inbox_conversation(p_lead_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released integer := 0;
begin
  update public.inbox_assignments
  set assigned_profile_id = null,
      assigned_name = '',
      claimed_at = null,
      lease_expires_at = null,
      updated_at = clock_timestamp(),
      version = version + 1
  where lead_id = p_lead_id
    and (
      assigned_profile_id = auth.uid()
      or public.current_user_is_any(array['boss','admin'])
    );
  get diagnostics v_released = row_count;

  if v_released = 1 then
    update public.leads
    set assigned_to = '', updated_at = clock_timestamp()
    where id = p_lead_id;
  end if;
  return v_released = 1;
end;
$$;

create or replace function public.assign_inbox_conversation(
  p_lead_id uuid,
  p_profile_id uuid,
  p_lease_minutes integer default 60
)
returns public.inbox_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
  v_assignment public.inbox_assignments%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if not public.current_user_is_any(array['boss','admin']) then
    raise exception 'boss or admin profile required';
  end if;
  select * into v_target from public.profiles
  where id = p_profile_id and active = true and role in ('boss','admin','sales')
  limit 1;
  if v_target.id is null then raise exception 'active assignable profile required'; end if;

  insert into public.inbox_assignments (
    lead_id, assigned_profile_id, assigned_name, claimed_at,
    lease_expires_at, updated_at, version
  ) values (
    p_lead_id, v_target.id, coalesce(v_target.full_name, v_target.email, 'Operator'), v_now,
    v_now + make_interval(mins => greatest(5, least(p_lease_minutes, 480))), v_now, 1
  )
  on conflict (lead_id) do update
  set assigned_profile_id = excluded.assigned_profile_id,
      assigned_name = excluded.assigned_name,
      claimed_at = excluded.claimed_at,
      lease_expires_at = excluded.lease_expires_at,
      updated_at = excluded.updated_at,
      version = public.inbox_assignments.version + 1
  returning * into v_assignment;

  update public.leads
  set assigned_to = v_assignment.assigned_name,
      lead_owner = v_assignment.assigned_name,
      updated_at = v_now
  where id = p_lead_id;
  return v_assignment;
end;
$$;

create or replace function public.consume_api_rate_limit(
  p_key_hash text,
  p_window_seconds integer,
  p_limit integer
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_seconds integer := greatest(10, least(p_window_seconds, 3600));
  v_limit integer := greatest(1, least(p_limit, 10000));
  v_window timestamptz;
  v_count integer;
begin
  if coalesce(char_length(p_key_hash), 0) < 16 then
    raise exception 'hashed rate limit key required';
  end if;
  v_window := to_timestamp(floor(extract(epoch from v_now) / v_window_seconds) * v_window_seconds);
  insert into public.api_rate_limit_windows (key_hash, window_started_at, request_count, updated_at)
  values (p_key_hash, v_window, 1, v_now)
  on conflict (key_hash, window_started_at) do update
  set request_count = public.api_rate_limit_windows.request_count + 1,
      updated_at = v_now
  returning request_count into v_count;

  delete from public.api_rate_limit_windows
  where updated_at < v_now - interval '2 hours';

  return query select v_count <= v_limit, greatest(0, v_limit - v_count),
    v_window + make_interval(secs => v_window_seconds);
end;
$$;

create schema if not exists limm_private;
revoke all on schema limm_private from public, anon, authenticated;

create or replace function limm_private.broadcast_inbox_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  v_lead_id text := coalesce(v_row ->> 'lead_id', v_row ->> 'id', '');
  v_payload jsonb := jsonb_build_object(
    'entity', TG_TABLE_NAME,
    'operation', lower(TG_OP),
    'leadId', v_lead_id,
    'occurredAt', clock_timestamp()
  );
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    execute 'select realtime.send($1, $2, $3, true)'
      using v_payload, 'inbox_activity', 'inbox:team:activity';
    if v_lead_id <> '' then
      execute 'select realtime.send($1, $2, $3, true)'
        using v_payload, 'inbox_activity', 'inbox:lead:' || v_lead_id;
    end if;
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

revoke all on function limm_private.broadcast_inbox_activity() from public, anon, authenticated;

drop trigger if exists leads_broadcast_inbox_activity on public.leads;
create trigger leads_broadcast_inbox_activity
after insert or update on public.leads
for each row execute function limm_private.broadcast_inbox_activity();

drop trigger if exists lead_messages_broadcast_inbox_activity on public.lead_messages;
create trigger lead_messages_broadcast_inbox_activity
after insert or update on public.lead_messages
for each row execute function limm_private.broadcast_inbox_activity();

drop trigger if exists inbox_assignments_broadcast_activity on public.inbox_assignments;
create trigger inbox_assignments_broadcast_activity
after insert or update or delete on public.inbox_assignments
for each row execute function limm_private.broadcast_inbox_activity();

drop trigger if exists inbox_notes_broadcast_activity on public.inbox_internal_notes;
create trigger inbox_notes_broadcast_activity
after insert or update or delete on public.inbox_internal_notes
for each row execute function limm_private.broadcast_inbox_activity();

do $realtime_policies$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists limm_inbox_realtime_select on realtime.messages';
    execute $policy$
      create policy limm_inbox_realtime_select on realtime.messages
      for select to authenticated
      using (
        public.current_user_is_any(array['boss','admin','sales','viewer'])
        and realtime.topic() like 'inbox:%'
      )
    $policy$;
    execute 'drop policy if exists limm_inbox_realtime_insert on realtime.messages';
    execute $policy$
      create policy limm_inbox_realtime_insert on realtime.messages
      for insert to authenticated
      with check (
        public.current_user_is_any(array['boss','admin','sales'])
        and realtime.topic() like 'inbox:%'
      )
    $policy$;
  end if;
end;
$realtime_policies$;

create or replace function public.world_class_operations_schema_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    to_regclass('public.inbox_assignments') is not null
    and to_regclass('public.inbox_internal_notes') is not null
    and to_regclass('public.operational_trace_events') is not null
    and to_regclass('public.ai_reply_quality_events') is not null
    and to_regclass('public.operator_product_events') is not null
    and to_regclass('public.api_rate_limit_windows') is not null
    and to_regprocedure('public.claim_inbox_conversation(uuid,integer)') is not null
    and to_regprocedure('public.release_inbox_conversation(uuid)') is not null
    and to_regprocedure('public.consume_api_rate_limit(text,integer,integer)') is not null;
$$;

revoke all on function public.claim_inbox_conversation(uuid, integer) from public, anon;
revoke all on function public.release_inbox_conversation(uuid) from public, anon;
revoke all on function public.assign_inbox_conversation(uuid, uuid, integer) from public, anon;
revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.world_class_operations_schema_ready() from public, anon, authenticated;
grant execute on function public.claim_inbox_conversation(uuid, integer) to authenticated;
grant execute on function public.release_inbox_conversation(uuid) to authenticated;
grant execute on function public.assign_inbox_conversation(uuid, uuid, integer) to authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;
grant execute on function public.world_class_operations_schema_ready() to service_role;

comment on table public.inbox_assignments is
  'v11.1 atomic operator ownership leases. Expired or unassigned conversations remain recoverable.';
comment on table public.inbox_internal_notes is
  'v11.1 internal-only team collaboration notes. Never sent to WhatsApp.';
comment on table public.operational_trace_events is
  'v11.1 redacted operational telemetry. Message bodies and secrets are forbidden.';
comment on table public.ai_reply_quality_events is
  'v11.1 versioned, privacy-minimised AI quality observations and operator outcomes.';
comment on table public.operator_product_events is
  'v11.1 privacy-minimised task analytics for product workflow improvement.';
