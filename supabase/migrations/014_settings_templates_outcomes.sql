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
