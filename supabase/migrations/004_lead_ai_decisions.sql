create table if not exists lead_ai_decisions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  decision jsonb not null,
  client_reply text not null default '',
  internal_notes text not null default '',
  boss_approval_needed boolean not null default false,
  created_at timestamptz not null default now()
);
