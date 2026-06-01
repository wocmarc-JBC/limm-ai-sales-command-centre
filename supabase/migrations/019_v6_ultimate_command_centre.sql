-- v6 Ultimate Sales Command Centre additive fields.
-- Safe/idempotent: only adds optional columns and indexes.

alter table if exists public.leads
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text default '',
  add column if not exists delete_reason text default '',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text default '',
  add column if not exists archived_reason text default '',
  add column if not exists is_test boolean not null default false,
  add column if not exists is_spam boolean not null default false,
  add column if not exists duplicate_of uuid,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by text default '',
  add column if not exists bot_paused boolean not null default false,
  add column if not exists bot_paused_at timestamptz,
  add column if not exists bot_paused_by text default '',
  add column if not exists bot_pause_reason text default '',
  add column if not exists assigned_to text default '',
  add column if not exists needs_marcus boolean not null default false,
  add column if not exists followed_up_at timestamptz,
  add column if not exists followed_up_by text default '',
  add column if not exists lead_level text,
  add column if not exists conversation_summary text default '',
  add column if not exists mission_category text default '';

create index if not exists leads_active_command_queue_idx
  on public.leads (updated_at desc)
  where deleted_at is null and archived_at is null and coalesce(is_spam, false) = false;

create index if not exists leads_cleanup_queue_idx
  on public.leads (deleted_at desc, archived_at desc, is_test, is_spam);

create index if not exists leads_bot_paused_idx
  on public.leads (bot_paused, updated_at desc);

create index if not exists leads_needs_marcus_idx
  on public.leads (needs_marcus, boss_approval_needed, updated_at desc);

alter table if exists public.settings
  add column if not exists audit_metadata jsonb not null default '{}'::jsonb;

comment on column public.leads.deleted_at is 'Soft-delete timestamp. Normal delete should set this instead of deleting rows.';
comment on column public.leads.bot_paused is 'When true, WhatsApp inbound is still saved but auto-reply is skipped for this lead.';
comment on column public.leads.lead_level is 'Derived sales control label such as Gold Lead, Warm Lead, Risk Lead, Spam/Test, or Needs Marcus.';
