create table if not exists followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  due_at timestamptz not null,
  template_type text not null,
  status text not null default 'scheduled',
  approval_required boolean not null default false,
  created_at timestamptz not null default now()
);
