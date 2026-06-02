-- v6.5 Smart Lead Intake + Meeting Prep Brain
-- Stores structured intake answers and readiness trace on the lead profile.
-- Safe to re-run: yes. Additive JSONB column only.

alter table public.leads
  add column if not exists intake_profile jsonb not null default '{}'::jsonb;

create index if not exists leads_intake_profile_gin
  on public.leads using gin (intake_profile);
