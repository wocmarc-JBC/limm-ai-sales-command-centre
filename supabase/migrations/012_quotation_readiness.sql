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
