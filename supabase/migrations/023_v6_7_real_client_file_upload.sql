create table if not exists lead_files (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  project_id uuid null,
  file_category text not null check (file_category in ('floor_plan', 'site_photos', 'reference_images', 'existing_quotation', 'building_rules', 'other_documents')),
  file_status text not null default 'received' check (file_status in ('missing', 'received', 'reviewed', 'needs_clarification', 'archived', 'voided')),
  original_file_name text not null default '',
  storage_bucket text not null default 'client-files',
  storage_path text not null,
  mime_type text not null default '',
  file_size_bytes bigint not null default 0,
  source text not null default 'unknown' check (source in ('whatsapp', 'upload_link', 'manual', 'unknown')),
  whatsapp_message_id text null,
  whatsapp_media_id text null,
  uploaded_by text null,
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by text null,
  notes text null,
  voided_at timestamptz null,
  voided_by text null,
  void_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lead_upload_links (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  is_active boolean not null default true,
  created_by text null,
  created_at timestamptz not null default now(),
  used_at timestamptz null,
  max_uploads integer not null default 20,
  notes text null
);

create index if not exists lead_files_lead_id_idx on lead_files(lead_id);
create index if not exists lead_files_file_category_idx on lead_files(file_category);
create index if not exists lead_files_source_idx on lead_files(source);
create index if not exists lead_files_voided_at_idx on lead_files(voided_at);
create index if not exists lead_upload_links_token_hash_idx on lead_upload_links(token_hash);
create index if not exists lead_upload_links_lead_id_idx on lead_upload_links(lead_id);

create or replace function set_lead_files_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_lead_files_updated_at on lead_files;
create trigger trg_set_lead_files_updated_at
before update on lead_files
for each row execute function set_lead_files_updated_at();

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('client-files', 'client-files', false)
    on conflict (id) do update set public = false;
  end if;
end $$;

comment on table lead_files is 'v6.7 private client file records linked to leads. Files must be viewed with signed URLs, not public bucket URLs.';
comment on table lead_upload_links is 'v6.7 secure client upload links. Raw tokens are not stored; only token_hash is retained.';
