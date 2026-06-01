-- v6.4 Singapore Mission Map additive location fields.
-- Safe/idempotent: adds optional area/postal/coordinate metadata only.

alter table if exists public.leads
  add column if not exists property_area text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists project_address text not null default '',
  add column if not exists planning_region text not null default '',
  add column if not exists planning_area text not null default '',
  add column if not exists map_lat numeric(10,7),
  add column if not exists map_lng numeric(10,7),
  add column if not exists location_confidence text not null default 'unknown',
  add column if not exists location_source text not null default 'unknown',
  add column if not exists location_notes text not null default '';

alter table if exists public.project_accounts
  add column if not exists property_area text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists project_address text not null default '',
  add column if not exists planning_region text not null default '',
  add column if not exists planning_area text not null default '',
  add column if not exists map_lat numeric(10,7),
  add column if not exists map_lng numeric(10,7),
  add column if not exists location_confidence text not null default 'unknown',
  add column if not exists location_source text not null default 'unknown',
  add column if not exists location_notes text not null default '';

create index if not exists leads_property_area_idx on public.leads (property_area, planning_area);
create index if not exists leads_postal_code_idx on public.leads (postal_code);
create index if not exists leads_map_location_idx on public.leads (map_lat, map_lng) where map_lat is not null and map_lng is not null;
create index if not exists project_accounts_property_area_idx on public.project_accounts (property_area, planning_area);
create index if not exists project_accounts_postal_code_idx on public.project_accounts (postal_code);
create index if not exists project_accounts_map_location_idx on public.project_accounts (map_lat, map_lng) where map_lat is not null and map_lng is not null;

comment on column public.leads.property_area is 'Privacy-safe dashboard area label for Singapore Mission Map.';
comment on column public.leads.project_address is 'Protected detail-level address/area note. Do not display full address on the main dashboard map.';
comment on column public.leads.location_confidence is 'exact, postal, area, or unknown. Area/postal map pins use approximate centroids.';
comment on column public.project_accounts.project_address is 'Protected project/account address note. Dashboard map should display area-level context only.';
