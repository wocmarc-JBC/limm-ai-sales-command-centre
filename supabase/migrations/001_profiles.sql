create table if not exists profiles (
  id uuid primary key,
  full_name text not null,
  role text not null default 'manager',
  created_at timestamptz not null default now()
);
