create table if not exists quotation_packages (
  id text primary key,
  lead_id uuid not null references leads(id) on delete cascade,
  client_name text not null default '',
  quotation_number text not null default '',
  version_number integer not null default 1,
  status text not null default 'Draft',
  prepared_by text not null default '',
  prepared_at timestamptz not null default now(),
  submitted_for_boss_review_at timestamptz,
  boss_reviewed_at timestamptz,
  boss_reviewed_by text not null default '',
  approved_at timestamptz,
  rejected_at timestamptz,
  revision_requested_at timestamptz,
  sent_at timestamptz,
  sent_by text not null default '',
  accepted_at timestamptz,
  rejected_by_client_at timestamptz,
  quotation_amount numeric not null default 0,
  internal_cost_estimate numeric,
  margin_estimate numeric,
  expiry_date date,
  scope_summary text not null default '',
  boss_notes text not null default '',
  revision_notes text not null default '',
  client_notes text not null default '',
  file_id text not null default '',
  storage_bucket text not null default 'client-files',
  storage_path text not null default '',
  original_file_name text not null default '',
  mime_type text not null default '',
  file_size_bytes bigint not null default 0,
  voided_at timestamptz,
  voided_by text not null default '',
  void_reason text not null default '',
  qa_run_id text not null default '',
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quotation_packages_lead_id_idx on quotation_packages(lead_id);
create index if not exists quotation_packages_status_idx on quotation_packages(status);
create index if not exists quotation_packages_qa_run_id_idx on quotation_packages(qa_run_id);
create unique index if not exists quotation_packages_lead_number_version_idx
  on quotation_packages(lead_id, quotation_number, version_number);

alter table quotation_packages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'quotation_packages' and policyname = 'quotation packages authenticated read'
  ) then
    create policy "quotation packages authenticated read"
      on quotation_packages for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'quotation_packages' and policyname = 'quotation packages authenticated write'
  ) then
    create policy "quotation packages authenticated write"
      on quotation_packages for all
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end $$;
