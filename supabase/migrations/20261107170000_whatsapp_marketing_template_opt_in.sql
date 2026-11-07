-- Explicit marketing opt-in for Meta-approved WhatsApp follow-up templates.
-- No existing lead is opted in by default. This table is service-role-only.
create table if not exists public.whatsapp_followup_consents (
  lead_id uuid not null references public.leads(id) on delete cascade,
  company_id uuid not null,
  category text not null default 'MARKETING' check (category = 'MARKETING'),
  status text not null check (status in ('OPTED_IN', 'OPTED_OUT')),
  consented_at timestamptz,
  source text not null,
  evidence text not null,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, lead_id, category),
  constraint whatsapp_followup_consent_evidence_valid check (length(evidence) between 12 and 1000)
);
create index if not exists whatsapp_followup_consents_active_idx
  on public.whatsapp_followup_consents(company_id, consented_at)
  where status = 'OPTED_IN';
alter table public.whatsapp_followup_consents enable row level security;
revoke all on public.whatsapp_followup_consents from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_followup_consents to service_role;
comment on table public.whatsapp_followup_consents is 'Service-only explicit Meta WhatsApp marketing opt-ins; never infer opt-in from inbound messages or a lead record. After STOP do not send without a new explicit opt-in.';
