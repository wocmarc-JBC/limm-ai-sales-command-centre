create table if not exists appointment_holds (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  appointment_slot_id uuid references appointment_slots(id) on delete set null,
  hold_expires_at timestamptz not null,
  status text not null default 'held',
  created_at timestamptz not null default now()
);
