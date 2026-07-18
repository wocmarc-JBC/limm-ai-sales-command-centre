-- v10.2.1 WhatsApp conversation concurrency and atomic reply reservation.
-- One database-backed lease is allowed per lead across all Vercel instances.

create table if not exists public.whatsapp_conversation_reply_leases (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  owner_token text not null default '',
  lease_expires_at timestamptz,
  cooldown_until timestamptz,
  pending_inbound_count integer not null default 0 check (pending_inbound_count >= 0),
  last_inbound_at timestamptz,
  last_acquired_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_reply_reservations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_token text not null,
  inbound_provider_message_id text not null,
  reply_signature text not null,
  reservation_bucket bigint not null,
  status text not null default 'reserved' check (status in ('reserved', 'sent', 'failed', 'blocked')),
  outbound_provider_message_id text,
  failure_reason text not null default '',
  reserved_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists whatsapp_reply_reservations_signature_bucket_uidx
  on public.whatsapp_reply_reservations (lead_id, reply_signature, reservation_bucket);

create index if not exists whatsapp_reply_reservations_lead_reserved_idx
  on public.whatsapp_reply_reservations (lead_id, reserved_at desc);

create index if not exists whatsapp_reply_reservations_status_idx
  on public.whatsapp_reply_reservations (status, reserved_at desc);

alter table public.whatsapp_conversation_reply_leases enable row level security;
alter table public.whatsapp_reply_reservations enable row level security;

revoke all on table public.whatsapp_conversation_reply_leases from public, anon, authenticated;
revoke all on table public.whatsapp_reply_reservations from public, anon, authenticated;
grant all on table public.whatsapp_conversation_reply_leases to service_role;
grant all on table public.whatsapp_reply_reservations to service_role;

create or replace function public.acquire_whatsapp_conversation_reply_lease(
  p_lead_id uuid,
  p_owner_token text,
  p_direct_question boolean default false,
  p_lease_seconds integer default 90
)
returns table(acquired boolean, reason text, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.whatsapp_conversation_reply_leases%rowtype;
  v_now timestamptz := clock_timestamp();
  v_expiry timestamptz := v_now + make_interval(secs => greatest(15, least(p_lease_seconds, 300)));
begin
  if p_lead_id is null or coalesce(p_owner_token, '') = '' then
    raise exception 'lead_id and owner_token are required';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name in (
        'conversation_intent',
        'lead_eligible',
        'conversation_route',
        'intent_confidence',
        'intent_reason_codes',
        'intent_classifier_version',
        'intent_manual_override',
        'intent_classified_at',
        'non_sales_acknowledged_at',
        'latest_unanswered_question',
        'conversation_safety_state'
      )
  ) <> 11 then
    raise exception 'migration 027 is required before WhatsApp reply leases can be acquired';
  end if;

  insert into public.whatsapp_conversation_reply_leases (lead_id, last_inbound_at, updated_at)
  values (p_lead_id, v_now, v_now)
  on conflict (lead_id) do nothing;

  select * into v_state
  from public.whatsapp_conversation_reply_leases
  where lead_id = p_lead_id
  for update;

  if coalesce(v_state.owner_token, '') <> ''
    and v_state.owner_token <> p_owner_token
    and coalesce(v_state.lease_expires_at, '-infinity'::timestamptz) > v_now then
    update public.whatsapp_conversation_reply_leases
    set pending_inbound_count = pending_inbound_count + 1,
        last_inbound_at = v_now,
        updated_at = v_now
    where lead_id = p_lead_id;
    return query select false, 'active_processing'::text, v_state.lease_expires_at;
    return;
  end if;

  if not coalesce(p_direct_question, false)
    and coalesce(v_state.cooldown_until, '-infinity'::timestamptz) > v_now then
    update public.whatsapp_conversation_reply_leases
    set owner_token = '',
        lease_expires_at = null,
        pending_inbound_count = pending_inbound_count + 1,
        last_inbound_at = v_now,
        updated_at = v_now
    where lead_id = p_lead_id;
    return query select false, 'cooldown_active'::text, null::timestamptz;
    return;
  end if;

  update public.whatsapp_conversation_reply_leases
  set owner_token = p_owner_token,
      lease_expires_at = v_expiry,
      pending_inbound_count = 0,
      last_inbound_at = v_now,
      last_acquired_at = v_now,
      updated_at = v_now
  where lead_id = p_lead_id;

  return query select true, 'acquired'::text, v_expiry;
end;
$$;

create or replace function public.release_whatsapp_conversation_reply_lease(
  p_lead_id uuid,
  p_owner_token text,
  p_cooldown_seconds integer default 0
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  update public.whatsapp_conversation_reply_leases
  set owner_token = '',
      lease_expires_at = null,
      cooldown_until = greatest(
        coalesce(cooldown_until, '-infinity'::timestamptz),
        v_now + make_interval(secs => greatest(0, least(p_cooldown_seconds, 300)))
      ),
      updated_at = v_now
  where lead_id = p_lead_id
    and owner_token = p_owner_token;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.reserve_whatsapp_conversation_reply(
  p_lead_id uuid,
  p_owner_token text,
  p_inbound_provider_message_id text,
  p_reply_signature text
)
returns table(reserved boolean, reason text, reservation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_bucket bigint := floor(extract(epoch from v_now) / 600)::bigint;
  v_id uuid;
begin
  perform 1
  from public.whatsapp_conversation_reply_leases
  where lead_id = p_lead_id
    and owner_token = p_owner_token
    and coalesce(lease_expires_at, '-infinity'::timestamptz) > v_now
  for update;

  if not found then
    return query select false, 'lease_not_owned'::text, null::uuid;
    return;
  end if;

  select id into v_id
  from public.whatsapp_reply_reservations
  where lead_id = p_lead_id
    and reply_signature = p_reply_signature
    and reserved_at > v_now - interval '10 minutes'
  order by reserved_at desc
  limit 1;

  if v_id is not null then
    return query select false, 'duplicate_reply_reservation'::text, v_id;
    return;
  end if;

  update public.whatsapp_conversation_reply_leases
  set lease_expires_at = greatest(lease_expires_at, v_now + interval '90 seconds'),
      updated_at = v_now
  where lead_id = p_lead_id
    and owner_token = p_owner_token;

  insert into public.whatsapp_reply_reservations (
    lead_id,
    owner_token,
    inbound_provider_message_id,
    reply_signature,
    reservation_bucket,
    reserved_at
  ) values (
    p_lead_id,
    p_owner_token,
    p_inbound_provider_message_id,
    p_reply_signature,
    v_bucket,
    v_now
  )
  on conflict (lead_id, reply_signature, reservation_bucket) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.whatsapp_reply_reservations
    where lead_id = p_lead_id
      and reply_signature = p_reply_signature
      and reservation_bucket = v_bucket
    limit 1;
    return query select false, 'duplicate_reply_reservation'::text, v_id;
    return;
  end if;

  return query select true, 'reserved'::text, v_id;
end;
$$;

create or replace function public.whatsapp_conversation_concurrency_schema_ready()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    to_regclass('public.whatsapp_conversation_reply_leases') is not null
    and to_regclass('public.whatsapp_reply_reservations') is not null
    and to_regprocedure('public.acquire_whatsapp_conversation_reply_lease(uuid,text,boolean,integer)') is not null
    and to_regprocedure('public.release_whatsapp_conversation_reply_lease(uuid,text,integer)') is not null
    and to_regprocedure('public.reserve_whatsapp_conversation_reply(uuid,text,text,text)') is not null;
$$;

revoke all on function public.acquire_whatsapp_conversation_reply_lease(uuid, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.release_whatsapp_conversation_reply_lease(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.reserve_whatsapp_conversation_reply(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.whatsapp_conversation_concurrency_schema_ready() from public, anon, authenticated;
grant execute on function public.acquire_whatsapp_conversation_reply_lease(uuid, text, boolean, integer) to service_role;
grant execute on function public.release_whatsapp_conversation_reply_lease(uuid, text, integer) to service_role;
grant execute on function public.reserve_whatsapp_conversation_reply(uuid, text, text, text) to service_role;
grant execute on function public.whatsapp_conversation_concurrency_schema_ready() to service_role;

comment on table public.whatsapp_conversation_reply_leases is
  'v10.2.1 cross-instance single-flight lease and burst cooldown for WhatsApp auto replies.';
comment on table public.whatsapp_reply_reservations is
  'v10.2.1 atomic reservation written before the external WhatsApp send call.';
