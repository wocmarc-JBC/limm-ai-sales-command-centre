-- Dedicated, fail-closed deduplication for automatic approved-template follow-ups.
-- A given verified inbound WhatsApp message can cause at most one automatic template attempt.
-- All data is service-role-only. This never opts in an existing customer.
create table if not exists public.whatsapp_auto_template_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete restrict,
  inbound_message_id uuid not null references public.lead_messages(id) on delete restrict,
  status text not null default 'reserved' check (status in ('reserved','accepted','failed','unknown','blocked')),
  recipient_phone text not null,
  provider_message_id text,
  reason_code text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (company_id, lead_id, inbound_message_id)
);
create index if not exists whatsapp_auto_template_attempts_created_idx
  on public.whatsapp_auto_template_attempts(company_id, requested_at desc);
alter table public.whatsapp_auto_template_attempts enable row level security;
revoke all on public.whatsapp_auto_template_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_auto_template_attempts to service_role;
comment on table public.whatsapp_auto_template_attempts is
  'One-shot automatic Meta-approved template re-engagement ledger. No retries after reservation; avoid duplicate customer messages and never claim delivery from WAMID alone.';
