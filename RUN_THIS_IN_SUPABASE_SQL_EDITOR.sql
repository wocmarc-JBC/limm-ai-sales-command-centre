/* LIMM AI Sales Command Centre v3 - Combined Supabase Migrations */

/* Generated: 05/28/2026 20:08:12 */



-- ============================================================
-- FILE: 001_profiles.sql
-- ============================================================

create table if not exists profiles (
  id uuid primary key,
  full_name text not null,
  role text not null default 'manager',
  created_at timestamptz not null default now()
);



-- ============================================================
-- FILE: 002_leads.sql
-- ============================================================

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  client_name text not null default '',
  phone text not null default '',
  source text not null default '',
  division text not null default 'LIMM Works',
  property_type text not null default '',
  service_type text not null default '',
  scope_summary text not null default '',
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  lead_category text not null default 'Cold',
  status text not null default 'New Enquiry',
  missing_info jsonb not null default '[]'::jsonb,
  ai_recommended_next_action text not null default '',
  boss_approval_needed boolean not null default false,
  appointment_readiness integer not null default 0 check (appointment_readiness between 0 and 100),
  quotation_readiness integer not null default 0 check (quotation_readiness between 0 and 100),
  risk_flags jsonb not null default '[]'::jsonb,
  preferred_contact_time text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);



-- ============================================================
-- FILE: 003_lead_messages.sql
-- ============================================================

create table if not exists lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  channel text not null default 'whatsapp',
  body text not null,
  safe_to_send boolean not null default false,
  created_at timestamptz not null default now()
);



-- ============================================================
-- FILE: 004_lead_ai_decisions.sql
-- ============================================================

create table if not exists lead_ai_decisions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  decision jsonb not null,
  client_reply text not null default '',
  internal_notes text not null default '',
  boss_approval_needed boolean not null default false,
  created_at timestamptz not null default now()
);



-- ============================================================
-- FILE: 005_appointments.sql
-- ============================================================

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  appointment_type text not null,
  status text not null default 'proposed',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Singapore',
  approval_required boolean not null default false,
  approval_reason text not null default '',
  created_at timestamptz not null default now()
);



-- ============================================================
-- FILE: 006_appointment_rules.sql
-- ============================================================

create table if not exists appointment_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'default',
  timezone text not null default 'Asia/Singapore',
  minimum_notice_hours integer not null default 24,
  max_appointments_per_day integer not null default 3,
  buffer_between_appointments_minutes integer not null default 30,
  same_day_booking_rule text not null default 'approval_required',
  public_holiday_rule text not null default 'approval_required',
  boss_approval_rules jsonb not null default '[]'::jsonb,
  day_settings jsonb not null,
  appointment_type_settings jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);



-- ============================================================
-- FILE: 007_appointment_slots.sql
-- ============================================================

create table if not exists appointment_slots (
  id uuid primary key default gen_random_uuid(),
  appointment_rule_id uuid references appointment_rules(id) on delete cascade,
  day_name text not null,
  appointment_type text not null,
  start_time time not null,
  end_time time not null,
  enabled boolean not null default true,
  approval_required boolean not null default false
);



-- ============================================================
-- FILE: 008_appointment_holds.sql
-- ============================================================

create table if not exists appointment_holds (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  appointment_slot_id uuid references appointment_slots(id) on delete set null,
  hold_expires_at timestamptz not null,
  status text not null default 'held',
  created_at timestamptz not null default now()
);



-- ============================================================
-- FILE: 009_followups.sql
-- ============================================================

create table if not exists followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  due_at timestamptz not null,
  template_type text not null,
  status text not null default 'scheduled',
  approval_required boolean not null default false,
  created_at timestamptz not null default now()
);



-- ============================================================
-- FILE: 010_approval_requests.sql
-- ============================================================

create table if not exists approval_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  request_type text not null,
  reason text not null,
  proposed_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);



-- ============================================================
-- FILE: 011_client_files.sql
-- ============================================================

create table if not exists client_files (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  file_type text not null,
  storage_path text not null,
  original_filename text not null default '',
  status text not null default 'received',
  created_at timestamptz not null default now()
);



-- ============================================================
-- FILE: 012_quotation_readiness.sql
-- ============================================================

create table if not exists quotation_readiness (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  readiness_score integer not null default 0 check (readiness_score between 0 and 100),
  boss_review_required boolean not null default false,
  missing_information jsonb not null default '[]'::jsonb,
  quote_preparation_checklist jsonb not null default '[]'::jsonb,
  next_action text not null default '',
  created_at timestamptz not null default now()
);



-- ============================================================
-- FILE: 013_audit_logs.sql
-- ============================================================

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);



-- ============================================================
-- FILE: 014_settings_templates_outcomes.sql
-- ============================================================

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  template_type text not null,
  channel text not null default 'whatsapp',
  body text not null,
  requires_approval boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists lead_outcomes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  outcome text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);



-- ============================================================
-- FILE: 015_v3_1_persistence_updates.sql
-- ============================================================

alter table leads add column if not exists email text not null default '';
alter table leads add column if not exists appointment_suitable boolean not null default false;
alter table leads add column if not exists appointment_type text not null default 'initial_project_review';
alter table leads add column if not exists quotation_readiness_score integer not null default 0 check (quotation_readiness_score between 0 and 100);
alter table leads add column if not exists next_action text not null default '';
alter table leads add column if not exists last_client_message text not null default '';
alter table leads add column if not exists last_reply_at timestamptz;

create index if not exists leads_status_idx on leads(status);
create index if not exists leads_score_idx on leads(lead_score desc);
create index if not exists leads_created_at_idx on leads(created_at desc);

alter table approval_requests add column if not exists title text not null default '';
alter table approval_requests add column if not exists approval_type text not null default 'general';
alter table approval_requests add column if not exists ai_recommendation text not null default '';
alter table approval_requests add column if not exists proposed_reply text not null default '';
alter table approval_requests add column if not exists risk_flags jsonb not null default '[]'::jsonb;
alter table approval_requests add column if not exists requested_at timestamptz not null default now();
alter table approval_requests add column if not exists notes text not null default '';

create index if not exists approval_requests_status_idx on approval_requests(status);
create index if not exists approval_requests_requested_at_idx on approval_requests(requested_at desc);

alter table followups add column if not exists followup_type text not null default '';
alter table followups add column if not exists suggested_message text not null default '';
alter table followups add column if not exists completed_at timestamptz;
alter table followups add column if not exists notes text not null default '';

create index if not exists followups_due_at_idx on followups(due_at);
create index if not exists followups_status_idx on followups(status);

alter table appointment_rules add column if not exists appointment_type text not null default 'default';
alter table appointment_rules add column if not exists allowed_days jsonb not null default '{}'::jsonb;
alter table appointment_rules add column if not exists standard_slots jsonb not null default '{}'::jsonb;
alter table appointment_rules add column if not exists max_per_day integer not null default 3;
alter table appointment_rules add column if not exists buffer_minutes integer not null default 30;
alter table appointment_rules add column if not exists same_day_rule text not null default 'approval_required';
alter table appointment_rules add column if not exists boss_approval_required boolean not null default true;
alter table appointment_rules add column if not exists active boolean not null default true;
do $$
begin
  alter table appointment_rules add constraint appointment_rules_name_unique unique (name);
exception when duplicate_object then
  null;
end $$;

create index if not exists appointment_rules_active_idx on appointment_rules(active);

create index if not exists appointments_starts_at_idx on appointments(starts_at);
create index if not exists appointments_status_idx on appointments(status);

alter table quotation_readiness add column if not exists missing_info jsonb not null default '[]'::jsonb;
alter table quotation_readiness add column if not exists status text not null default 'collecting_info';
alter table quotation_readiness add column if not exists updated_at timestamptz not null default now();

create index if not exists quotation_readiness_lead_id_idx on quotation_readiness(lead_id);
create index if not exists quotation_readiness_status_idx on quotation_readiness(status);

alter table audit_logs add column if not exists actor_type text not null default 'system';
alter table audit_logs add column if not exists actor_name text not null default 'System';
alter table audit_logs add column if not exists before_data jsonb;
alter table audit_logs add column if not exists after_data jsonb;
alter table audit_logs add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists audit_logs_entity_type_idx on audit_logs(entity_type);
create index if not exists audit_logs_action_idx on audit_logs(action);
create index if not exists audit_logs_created_at_idx on audit_logs(created_at desc);

alter table settings add column if not exists id uuid default gen_random_uuid();

-- RLS-ready posture:
-- Policies are intentionally not enabled in v3.1 because this scaffold still supports local development
-- and has no production authentication layer yet. v3.2 should enable RLS with Supabase Auth roles
-- before any live internal deployment.



-- ============================================================
-- FILE: 016_v3_2_auth_rls.sql
-- ============================================================

alter table profiles add column if not exists email text not null default '';
alter table profiles add column if not exists active boolean not null default true;
alter table profiles add column if not exists updated_at timestamptz not null default now();

update profiles set role = 'boss' where role = 'manager';
alter table profiles alter column role set default 'viewer';

do $$
begin
  alter table profiles add constraint profiles_role_check check (role in ('boss', 'admin', 'sales', 'viewer'));
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter table profiles add constraint profiles_auth_user_fk foreign key (id) references auth.users(id) on delete cascade;
exception when duplicate_object then
  null;
end $$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid() and active = true
$$;

create or replace function public.current_user_is_any(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = any(allowed_roles), false)
$$;

alter table profiles enable row level security;
alter table leads enable row level security;
alter table lead_messages enable row level security;
alter table lead_ai_decisions enable row level security;
alter table appointments enable row level security;
alter table appointment_rules enable row level security;
alter table appointment_slots enable row level security;
alter table appointment_holds enable row level security;
alter table followups enable row level security;
alter table approval_requests enable row level security;
alter table client_files enable row level security;
alter table quotation_readiness enable row level security;
alter table audit_logs enable row level security;
alter table settings enable row level security;
alter table message_templates enable row level security;
alter table lead_outcomes enable row level security;

drop policy if exists profiles_select_authenticated on profiles;
create policy profiles_select_authenticated on profiles
for select to authenticated
using (id = auth.uid() or public.current_user_is_any(array['boss','admin']));

drop policy if exists profiles_update_boss_admin on profiles;
create policy profiles_update_boss_admin on profiles
for update to authenticated
using (public.current_user_is_any(array['boss','admin']))
with check (public.current_user_is_any(array['boss','admin']));

drop policy if exists profiles_insert_boss_admin on profiles;
create policy profiles_insert_boss_admin on profiles
for insert to authenticated
with check (public.current_user_is_any(array['boss','admin']));

drop policy if exists leads_select_roles on leads;
create policy leads_select_roles on leads
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists leads_insert_staff on leads;
create policy leads_insert_staff on leads
for insert to authenticated
with check (public.current_user_is_any(array['boss','admin','sales']));

drop policy if exists leads_update_staff on leads;
create policy leads_update_staff on leads
for update to authenticated
using (public.current_user_is_any(array['boss','admin','sales']))
with check (public.current_user_is_any(array['boss','admin','sales']));

drop policy if exists lead_messages_select_roles on lead_messages;
create policy lead_messages_select_roles on lead_messages
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists lead_messages_insert_staff on lead_messages;
create policy lead_messages_insert_staff on lead_messages
for insert to authenticated
with check (public.current_user_is_any(array['boss','admin','sales']));

drop policy if exists lead_ai_decisions_select_roles on lead_ai_decisions;
create policy lead_ai_decisions_select_roles on lead_ai_decisions
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists lead_ai_decisions_insert_staff on lead_ai_decisions;
create policy lead_ai_decisions_insert_staff on lead_ai_decisions
for insert to authenticated
with check (public.current_user_is_any(array['boss','admin','sales']));

drop policy if exists appointments_select_roles on appointments;
create policy appointments_select_roles on appointments
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists appointments_write_staff on appointments;
create policy appointments_write_staff on appointments
for all to authenticated
using (public.current_user_is_any(array['boss','admin','sales']))
with check (public.current_user_is_any(array['boss','admin','sales']));

drop policy if exists appointment_rules_select_roles on appointment_rules;
create policy appointment_rules_select_roles on appointment_rules
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists appointment_rules_update_boss on appointment_rules;
create policy appointment_rules_update_boss on appointment_rules
for update to authenticated
using (public.current_user_is_any(array['boss']))
with check (public.current_user_is_any(array['boss']));

drop policy if exists appointment_rules_insert_boss on appointment_rules;
create policy appointment_rules_insert_boss on appointment_rules
for insert to authenticated
with check (public.current_user_is_any(array['boss']));

drop policy if exists appointment_slots_select_roles on appointment_slots;
create policy appointment_slots_select_roles on appointment_slots
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists appointment_slots_write_boss_admin on appointment_slots;
create policy appointment_slots_write_boss_admin on appointment_slots
for all to authenticated
using (public.current_user_is_any(array['boss','admin']))
with check (public.current_user_is_any(array['boss','admin']));

drop policy if exists appointment_holds_select_roles on appointment_holds;
create policy appointment_holds_select_roles on appointment_holds
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists appointment_holds_write_staff on appointment_holds;
create policy appointment_holds_write_staff on appointment_holds
for all to authenticated
using (public.current_user_is_any(array['boss','admin','sales']))
with check (public.current_user_is_any(array['boss','admin','sales']));

drop policy if exists followups_select_roles on followups;
create policy followups_select_roles on followups
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists followups_write_staff on followups;
create policy followups_write_staff on followups
for all to authenticated
using (public.current_user_is_any(array['boss','admin','sales']))
with check (public.current_user_is_any(array['boss','admin','sales']));

drop policy if exists approval_requests_select_roles on approval_requests;
create policy approval_requests_select_roles on approval_requests
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists approval_requests_insert_staff on approval_requests;
create policy approval_requests_insert_staff on approval_requests
for insert to authenticated
with check (public.current_user_is_any(array['boss','admin','sales']));

drop policy if exists approval_requests_update_boss_admin on approval_requests;
create policy approval_requests_update_boss_admin on approval_requests
for update to authenticated
using (public.current_user_is_any(array['boss','admin']))
with check (public.current_user_is_any(array['boss','admin']));

drop policy if exists client_files_select_roles on client_files;
create policy client_files_select_roles on client_files
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists client_files_write_staff on client_files;
create policy client_files_write_staff on client_files
for all to authenticated
using (public.current_user_is_any(array['boss','admin','sales']))
with check (public.current_user_is_any(array['boss','admin','sales']));

drop policy if exists quotation_readiness_select_roles on quotation_readiness;
create policy quotation_readiness_select_roles on quotation_readiness
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists quotation_readiness_write_boss_admin on quotation_readiness;
create policy quotation_readiness_write_boss_admin on quotation_readiness
for all to authenticated
using (public.current_user_is_any(array['boss','admin']))
with check (public.current_user_is_any(array['boss','admin']));

drop policy if exists audit_logs_select_boss_admin on audit_logs;
create policy audit_logs_select_boss_admin on audit_logs
for select to authenticated
using (public.current_user_is_any(array['boss','admin']));

drop policy if exists audit_logs_insert_authenticated on audit_logs;
create policy audit_logs_insert_authenticated on audit_logs
for insert to authenticated
with check (auth.uid() is not null);

-- No update/delete policy is created for audit_logs. This intentionally protects audit history.

drop policy if exists settings_select_roles on settings;
create policy settings_select_roles on settings
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists settings_write_boss on settings;
create policy settings_write_boss on settings
for all to authenticated
using (public.current_user_is_any(array['boss']))
with check (public.current_user_is_any(array['boss']));

drop policy if exists message_templates_select_roles on message_templates;
create policy message_templates_select_roles on message_templates
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists message_templates_write_boss_admin on message_templates;
create policy message_templates_write_boss_admin on message_templates
for all to authenticated
using (public.current_user_is_any(array['boss','admin']))
with check (public.current_user_is_any(array['boss','admin']));

drop policy if exists lead_outcomes_select_roles on lead_outcomes;
create policy lead_outcomes_select_roles on lead_outcomes
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists lead_outcomes_write_staff on lead_outcomes;
create policy lead_outcomes_write_staff on lead_outcomes
for all to authenticated
using (public.current_user_is_any(array['boss','admin','sales']))
with check (public.current_user_is_any(array['boss','admin','sales']));

-- v3.2 note:
-- These policies are role-aware and block anonymous access in Supabase Mode.
-- They remain development-friendly by allowing sales to view all leads until assignment is implemented.

