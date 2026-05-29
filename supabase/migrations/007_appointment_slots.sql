create table if not exists appointment_slots (
  id uuid primary key default gen_random_uuid(),
  appointment_rule_id uuid references appointment_rules(id) on delete cascade,
  day_name text not null,
  appointment_type text not null,
  start_time time not null,
  end_time time not null,
  enabled boolean not null default true,
  approval_required boolean not null default false
);
