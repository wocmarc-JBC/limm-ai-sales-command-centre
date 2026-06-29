-- QA-only downstream workflow test flags.
-- Additive/idempotent: lets QA project/payment records stay hidden from normal production views.

alter table if exists public.project_accounts
  add column if not exists is_test boolean not null default false;

alter table if exists public.payment_records
  add column if not exists is_test boolean not null default false;

create index if not exists project_accounts_is_test_idx
  on public.project_accounts (is_test, updated_at desc);

create index if not exists payment_records_is_test_idx
  on public.payment_records (is_test, created_at desc);

comment on column public.project_accounts.is_test is
  'True only for QA/demo downstream workflow records. Hidden from normal production views by default.';

comment on column public.payment_records.is_test is
  'True only for QA/demo payment schedule records. Hidden from normal production views by default.';
