-- v11.2.0 Durable WhatsApp ingress, delivery receipts, indexed inbox activity,
-- and attachment authorization hardening.

create table if not exists public.whatsapp_inbound_jobs (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  message jsonb not null,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error_code text not null default '',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_inbound_jobs_claim_idx
  on public.whatsapp_inbound_jobs (available_at, created_at)
  where status in ('queued','failed');

alter table public.whatsapp_inbound_jobs enable row level security;
revoke all on table public.whatsapp_inbound_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_inbound_jobs to service_role;
drop policy if exists whatsapp_inbound_jobs_service_role on public.whatsapp_inbound_jobs;
create policy whatsapp_inbound_jobs_service_role on public.whatsapp_inbound_jobs
for all to service_role using (true) with check (true);

create or replace function public.claim_whatsapp_inbound_job(p_job_id uuid default null)
returns setof public.whatsapp_inbound_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select job.id into v_id
  from public.whatsapp_inbound_jobs job
  where (p_job_id is null or job.id = p_job_id)
    and job.status in ('queued','failed')
    and job.available_at <= now()
    and (job.locked_at is null or job.locked_at < now() - interval '5 minutes')
    and job.attempt_count < 8
  order by job.available_at, job.created_at
  for update skip locked
  limit 1;

  if v_id is null then return; end if;

  return query
  update public.whatsapp_inbound_jobs job
  set status = 'processing', locked_at = now(), attempt_count = job.attempt_count + 1, updated_at = now()
  where job.id = v_id
  returning job.*;
end;
$$;

revoke all on function public.claim_whatsapp_inbound_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_inbound_job(uuid) to service_role;

create table if not exists public.whatsapp_delivery_events (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null,
  status text not null check (status in ('sent','delivered','read','failed','deleted')),
  provider_timestamp timestamptz,
  recipient_phone text not null default '',
  error_code text not null default '',
  error_title text not null default '',
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider_message_id, status, provider_timestamp)
);

create index if not exists whatsapp_delivery_events_message_idx
  on public.whatsapp_delivery_events (provider_message_id, created_at desc);
alter table public.whatsapp_delivery_events enable row level security;
revoke all on table public.whatsapp_delivery_events from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_delivery_events to service_role;
drop policy if exists whatsapp_delivery_events_service_role on public.whatsapp_delivery_events;
create policy whatsapp_delivery_events_service_role on public.whatsapp_delivery_events
for all to service_role using (true) with check (true);

alter table public.lead_messages
  add column if not exists whatsapp_delivered_at timestamptz,
  add column if not exists whatsapp_read_at timestamptz,
  add column if not exists whatsapp_failed_at timestamptz;

create or replace function public.apply_whatsapp_delivery_status(
  p_provider_message_id text,
  p_status text,
  p_provider_timestamp timestamptz,
  p_recipient_phone text,
  p_error_code text,
  p_error_title text,
  p_raw_metadata jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_changed integer := 0;
begin
  if p_status not in ('sent','delivered','read','failed','deleted') then return false; end if;

  insert into public.whatsapp_delivery_events (
    provider_message_id, status, provider_timestamp, recipient_phone,
    error_code, error_title, raw_metadata
  ) values (
    p_provider_message_id, p_status, p_provider_timestamp, left(coalesce(p_recipient_phone,''),64),
    left(coalesce(p_error_code,''),100), left(coalesce(p_error_title,''),300), coalesce(p_raw_metadata,'{}'::jsonb)
  ) on conflict do nothing;

  update public.lead_messages
  set whatsapp_status = case
        when p_status = 'read' then 'read'
        when p_status = 'delivered' and whatsapp_status <> 'read' then 'delivered'
        when p_status = 'sent' and whatsapp_status not in ('delivered','read') then 'sent'
        when p_status = 'failed' and whatsapp_status <> 'read' then 'failed'
        else whatsapp_status end,
      whatsapp_delivered_at = case when p_status in ('delivered','read') then coalesce(whatsapp_delivered_at,p_provider_timestamp,now()) else whatsapp_delivered_at end,
      whatsapp_read_at = case when p_status = 'read' then coalesce(whatsapp_read_at,p_provider_timestamp,now()) else whatsapp_read_at end,
      whatsapp_failed_at = case when p_status = 'failed' then coalesce(whatsapp_failed_at,p_provider_timestamp,now()) else whatsapp_failed_at end,
      metadata = case when p_status = 'failed' then coalesce(metadata,'{}'::jsonb) || jsonb_build_object('deliveryErrorCode',p_error_code,'deliveryErrorTitle',p_error_title) else metadata end
  where provider_message_id = p_provider_message_id;
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$$;

revoke all on function public.apply_whatsapp_delivery_status(text,text,timestamptz,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.apply_whatsapp_delivery_status(text,text,timestamptz,text,text,text,jsonb) to service_role;

alter table public.leads add column if not exists last_whatsapp_activity_at timestamptz;
update public.leads lead
set last_whatsapp_activity_at = latest.created_at
from (
  select lead_id, max(created_at) created_at from public.lead_messages
  where channel = 'whatsapp' group by lead_id
) latest
where lead.id = latest.lead_id and lead.last_whatsapp_activity_at is null;

create or replace function public.touch_lead_whatsapp_activity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.channel = 'whatsapp' then
    update public.leads set last_whatsapp_activity_at = greatest(coalesce(last_whatsapp_activity_at,'-infinity'::timestamptz),new.created_at) where id = new.lead_id;
  end if;
  return new;
end;
$$;
drop trigger if exists lead_messages_touch_whatsapp_activity on public.lead_messages;
create trigger lead_messages_touch_whatsapp_activity after insert on public.lead_messages
for each row execute function public.touch_lead_whatsapp_activity();

create index if not exists leads_inbox_activity_idx
  on public.leads (last_whatsapp_activity_at desc nulls last, id desc)
  where deleted_at is null and archived_at is null and coalesce(is_spam,false) = false;

-- Attachment rows must be visible only when their parent lead is visible under
-- the assignment-aware leads policy. Signed URLs are issued only after this RLS check.
drop policy if exists lead_files_select_roles on public.lead_files;
create policy lead_files_select_visible_lead on public.lead_files
for select to authenticated
using (
  exists (
    select 1 from public.leads parent_lead
    where parent_lead.id = lead_files.lead_id
      and parent_lead.deleted_at is null
      and parent_lead.archived_at is null
      and coalesce(parent_lead.is_spam, false) = false
      and (
        public.current_user_is_any(array['boss','admin','viewer'])
        or (
          public.current_user_is_any(array['sales'])
          and not exists (
            select 1 from public.inbox_assignments assignment
            where assignment.lead_id = parent_lead.id
              and assignment.assigned_profile_id is not null
              and coalesce(assignment.lease_expires_at, '-infinity'::timestamptz) > now()
              and assignment.assigned_profile_id <> (select auth.uid())
          )
        )
      )
    )
);

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid()) and active = true
$$;
create or replace function public.current_user_is_any(allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_user_role() = any(allowed_roles), false)
$$;
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.current_user_is_any(text[]) from public, anon;
grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.current_user_is_any(text[]) to authenticated, service_role;

create or replace function public.set_lead_files_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.set_audit_logs_actor()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.actor_name is null or btrim(new.actor_name) = '' then
    new.actor_name := coalesce(nullif(new.actor, ''), 'System');
  end if;
  if new.actor is null or btrim(new.actor) = '' then
    new.actor := new.actor_name;
  end if;
  return new;
end;
$$;
