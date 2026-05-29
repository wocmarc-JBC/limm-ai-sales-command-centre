create table if not exists appointment_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'default',
  timezone text not null default 'Asia/Singapore',
  minimum_notice_hours integer not null default 24,
  max_appointments_per_day integer not null default 3,
  buffer_between_appointments_minutes integer not null default 30,
  same_day_booking_rule text not null default 'approval_required',
  public_holiday_rule text not null default 'approval_required',
  boss_approval_rules jsonb not null default '[]'::jsonb,
  day_settings jsonb not null,
  appointment_type_settings jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
