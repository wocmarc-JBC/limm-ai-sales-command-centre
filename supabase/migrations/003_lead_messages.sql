create table if not exists lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound', 'internal')),
  channel text not null default 'whatsapp',
  body text not null,
  safe_to_send boolean not null default false,
  created_at timestamptz not null default now()
);
