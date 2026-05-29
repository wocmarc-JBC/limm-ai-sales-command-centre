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
