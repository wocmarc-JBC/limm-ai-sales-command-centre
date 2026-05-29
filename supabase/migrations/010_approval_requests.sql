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
