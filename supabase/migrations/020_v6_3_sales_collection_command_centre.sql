-- v6.3 Sales + Collection Command Centre.
-- Additive/idempotent: manual sales pipeline, manual quotation tracking,
-- non-GST collection tracking, monthly targets, and void-not-delete payments.

alter table if exists public.leads
  add column if not exists sales_stage text not null default 'New Lead',
  add column if not exists lead_owner text not null default '',
  add column if not exists sales_next_action text not null default '',
  add column if not exists follow_up_date date,
  add column if not exists probability_percent integer not null default 0,
  add column if not exists potential_value numeric(12,2) not null default 0,
  add column if not exists expected_close_date date,
  add column if not exists lead_source text,
  add column if not exists won_lost_reason text not null default '',
  add column if not exists stage_notes text not null default '',
  add column if not exists quotation_status text not null default 'Not Ready',
  add column if not exists quoted_amount numeric(12,2) not null default 0,
  add column if not exists quote_sent_date date,
  add column if not exists quote_expiry_date date,
  add column if not exists quote_revision_count integer not null default 0,
  add column if not exists quote_follow_up_date date,
  add column if not exists quote_notes text not null default '',
  add column if not exists confirmed_value numeric(12,2) not null default 0,
  add column if not exists won_date timestamptz,
  add column if not exists lost_date timestamptz,
  add column if not exists project_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_probability_percent_range'
    and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_probability_percent_range
      check (probability_percent >= 0 and probability_percent <= 100);
  end if;
end $$;

create table if not exists public.project_accounts (
  id text primary key default gen_random_uuid()::text,
  lead_id text not null,
  source_lead_id text not null unique,
  client_name text not null default '',
  phone text not null default '',
  property_type text not null default '',
  scope_summary text not null default '',
  quoted_amount numeric(12,2) not null default 0,
  confirmed_value numeric(12,2) not null default 0,
  notes text not null default '',
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_records (
  id text primary key default gen_random_uuid()::text,
  project_id text not null,
  lead_id text not null default '',
  payment_type text not null default 'other',
  amount numeric(12,2) not null default 0,
  due_date date,
  received_date date,
  status text not null default 'No Payment Yet',
  notes text not null default '',
  voided_at timestamptz,
  voided_by text not null default '',
  void_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_targets (
  id text primary key default gen_random_uuid()::text,
  target_month text not null unique,
  monthly_sales_target numeric(12,2) not null default 0,
  monthly_confirmed_jobs_target integer not null default 0,
  monthly_site_visit_target integer not null default 0,
  monthly_quotation_target integer not null default 0,
  monthly_landed_lead_target integer not null default 0,
  monthly_commercial_lead_target integer not null default 0,
  monthly_collection_target numeric(12,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_sales_stage_idx on public.leads (sales_stage, updated_at desc);
create index if not exists leads_quotation_status_idx on public.leads (quotation_status, quote_follow_up_date);
create index if not exists leads_expected_close_date_idx on public.leads (expected_close_date);
create index if not exists project_accounts_status_idx on public.project_accounts (status, updated_at desc);
create index if not exists project_accounts_source_lead_idx on public.project_accounts (source_lead_id);
create index if not exists payment_records_project_idx on public.payment_records (project_id, voided_at);
create index if not exists payment_records_due_idx on public.payment_records (due_date, status) where voided_at is null;
create index if not exists monthly_targets_month_idx on public.monthly_targets (target_month);

alter table public.project_accounts enable row level security;
alter table public.payment_records enable row level security;
alter table public.monthly_targets enable row level security;

drop policy if exists project_accounts_select_roles on public.project_accounts;
create policy project_accounts_select_roles on public.project_accounts
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists project_accounts_insert_staff on public.project_accounts;
create policy project_accounts_insert_staff on public.project_accounts
for insert to authenticated
with check (public.current_user_is_any(array['boss','admin','sales']));

drop policy if exists project_accounts_update_staff on public.project_accounts;
create policy project_accounts_update_staff on public.project_accounts
for update to authenticated
using (public.current_user_is_any(array['boss','admin','sales']))
with check (public.current_user_is_any(array['boss','admin','sales']));

drop policy if exists payment_records_select_roles on public.payment_records;
create policy payment_records_select_roles on public.payment_records
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists payment_records_insert_boss_admin on public.payment_records;
create policy payment_records_insert_boss_admin on public.payment_records
for insert to authenticated
with check (public.current_user_is_any(array['boss','admin']));

drop policy if exists payment_records_update_boss_admin on public.payment_records;
create policy payment_records_update_boss_admin on public.payment_records
for update to authenticated
using (public.current_user_is_any(array['boss','admin']))
with check (public.current_user_is_any(array['boss','admin']));

drop policy if exists monthly_targets_select_roles on public.monthly_targets;
create policy monthly_targets_select_roles on public.monthly_targets
for select to authenticated
using (public.current_user_is_any(array['boss','admin','sales','viewer']));

drop policy if exists monthly_targets_insert_boss_admin on public.monthly_targets;
create policy monthly_targets_insert_boss_admin on public.monthly_targets
for insert to authenticated
with check (public.current_user_is_any(array['boss','admin']));

drop policy if exists monthly_targets_update_boss_admin on public.monthly_targets;
create policy monthly_targets_update_boss_admin on public.monthly_targets
for update to authenticated
using (public.current_user_is_any(array['boss','admin']))
with check (public.current_user_is_any(array['boss','admin']));

comment on table public.project_accounts is 'Manual project/account tracker created from won leads. No GST calculation or automated pricing.';
comment on table public.payment_records is 'Manual collection tracker. Incorrect payment rows should be voided, not deleted.';
comment on table public.monthly_targets is 'Manual boss targets for sales, quotations, site visits, and collections.';
comment on column public.leads.quoted_amount is 'Manual quotation amount entered by boss/team only. No price guide automation.';
comment on column public.leads.confirmed_value is 'Manual confirmed job value for sales tracking only. LIMM Works is not GST-registered.';
