create table if not exists client_files (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  file_type text not null,
  storage_path text not null,
  original_filename text not null default '',
  status text not null default 'received',
  created_at timestamptz not null default now()
);
