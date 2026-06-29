-- Adds project/account location fields used by downstream QA and delivery workflows.
-- Safe to re-run. Does not mutate business records beyond adding nullable/defaulted columns.

alter table if exists public.project_accounts
  add column if not exists property_area text,
  add column if not exists postal_code text,
  add column if not exists project_address text,
  add column if not exists planning_region text,
  add column if not exists planning_area text,
  add column if not exists map_lat double precision,
  add column if not exists map_lng double precision,
  add column if not exists location_confidence text not null default 'unknown',
  add column if not exists location_source text,
  add column if not exists location_notes text;

do $$
begin
  if to_regclass('public.project_accounts') is not null then
    create index if not exists project_accounts_location_idx
      on public.project_accounts (property_area, planning_area, postal_code);

    comment on column public.project_accounts.location_confidence is
      'exact, postal, area, or unknown. Used by delivery and map-safe project/account views.';
  end if;
end $$;
