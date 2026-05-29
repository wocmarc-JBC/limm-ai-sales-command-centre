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
