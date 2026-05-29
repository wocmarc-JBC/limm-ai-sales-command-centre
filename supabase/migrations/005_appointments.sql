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
