-- v11.1.1 WhatsApp Persistence Recovery
-- Repairs the missing smart-intake column and preserves inbound content when
-- message processing fails before the normal lead_messages insert can run.

alter table public.leads
  add column if not exists intake_profile jsonb not null default '{}'::jsonb;

create index if not exists leads_intake_profile_gin
  on public.leads using gin (intake_profile);

create table if not exists public.whatsapp_webhook_failures (
  id uuid primary key default gen_random_uuid(),
  provider_message_id_hash text not null unique
    check (char_length(provider_message_id_hash) = 24),
  sender_phone text not null default ''
    check (char_length(sender_phone) <= 64),
  message_body text not null default ''
    check (char_length(message_body) <= 8192),
  message_type text not null default ''
    check (char_length(message_type) <= 50),
  provider_timestamp timestamptz,
  failure_stage text not null default 'message_processing'
    check (char_length(failure_stage) <= 100),
  error_code text not null default 'message_processing_failed'
    check (char_length(error_code) <= 100),
  safe_reason text not null default ''
    check (char_length(safe_reason) <= 500),
  message_metadata jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 1 check (attempt_count > 0),
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  recovered_at timestamptz,
  recovered_lead_id uuid references public.leads(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days')
);

create index if not exists whatsapp_webhook_failures_unrecovered_idx
  on public.whatsapp_webhook_failures (last_failed_at desc)
  where recovered_at is null;

create index if not exists whatsapp_webhook_failures_recovered_lead_idx
  on public.whatsapp_webhook_failures (recovered_lead_id)
  where recovered_lead_id is not null;

alter table public.whatsapp_webhook_failures enable row level security;

revoke all on table public.whatsapp_webhook_failures from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_webhook_failures to service_role;

drop policy if exists whatsapp_webhook_failures_service_role on public.whatsapp_webhook_failures;
create policy whatsapp_webhook_failures_service_role on public.whatsapp_webhook_failures
for all to service_role using (true) with check (true);

create or replace function public.capture_whatsapp_webhook_failure(
  p_provider_message_id_hash text,
  p_sender_phone text,
  p_message_body text,
  p_message_type text,
  p_provider_timestamp timestamptz,
  p_failure_stage text,
  p_error_code text,
  p_safe_reason text,
  p_message_metadata jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if char_length(coalesce(p_provider_message_id_hash, '')) <> 24 then
    raise exception 'valid provider message hash required';
  end if;

  insert into public.whatsapp_webhook_failures (
    provider_message_id_hash,
    sender_phone,
    message_body,
    message_type,
    provider_timestamp,
    failure_stage,
    error_code,
    safe_reason,
    message_metadata
  ) values (
    p_provider_message_id_hash,
    left(coalesce(p_sender_phone, ''), 64),
    left(coalesce(p_message_body, ''), 8192),
    left(coalesce(p_message_type, ''), 50),
    p_provider_timestamp,
    left(coalesce(p_failure_stage, 'message_processing'), 100),
    left(coalesce(p_error_code, 'message_processing_failed'), 100),
    left(coalesce(p_safe_reason, ''), 500),
    coalesce(p_message_metadata, '{}'::jsonb)
  )
  on conflict (provider_message_id_hash) do update
  set sender_phone = excluded.sender_phone,
      message_body = excluded.message_body,
      message_type = excluded.message_type,
      provider_timestamp = coalesce(excluded.provider_timestamp, public.whatsapp_webhook_failures.provider_timestamp),
      failure_stage = excluded.failure_stage,
      error_code = excluded.error_code,
      safe_reason = excluded.safe_reason,
      message_metadata = excluded.message_metadata,
      attempt_count = public.whatsapp_webhook_failures.attempt_count + 1,
      last_failed_at = now(),
      recovered_at = null,
      recovered_lead_id = null,
      expires_at = now() + interval '14 days';

  return true;
end;
$$;

revoke all on function public.capture_whatsapp_webhook_failure(
  text, text, text, text, timestamptz, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.capture_whatsapp_webhook_failure(
  text, text, text, text, timestamptz, text, text, text, jsonb
) to service_role;

comment on table public.whatsapp_webhook_failures is
  'Service-only, short-retention recovery inbox for inbound WhatsApp content that failed before lead_messages persistence.';

comment on column public.whatsapp_webhook_failures.expires_at is
  'Retention deadline. Expired rows must be purged by the operations retention job.';
