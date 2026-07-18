-- v10.2.0 Intent Gate & Conversation Safety.
-- Additive/idempotent routing state for WhatsApp conversations.
-- Existing lead rows remain sales-eligible until a real inbound message is classified.

alter table if exists public.leads
  add column if not exists conversation_intent text not null default 'genuine_new_renovation_lead',
  add column if not exists lead_eligible boolean not null default true,
  add column if not exists conversation_route text not null default 'sales_lead',
  add column if not exists intent_confidence numeric(4,3) not null default 0,
  add column if not exists intent_reason_codes jsonb not null default '[]'::jsonb,
  add column if not exists intent_classifier_version text not null default '',
  add column if not exists intent_manual_override text,
  add column if not exists intent_classified_at timestamptz,
  add column if not exists non_sales_acknowledged_at timestamptz,
  add column if not exists latest_unanswered_question jsonb,
  add column if not exists conversation_safety_state jsonb not null default '{}'::jsonb;

-- Preserve classifications written to the additive intake-profile fallback when
-- application code reached production before this migration was applied.
-- Some older live schemas predate migration 022. The intent columns are still
-- valid there; only the optional fallback backfill must be skipped.
do $intent_gate_backfill$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'intake_profile'
  ) then
    execute $intent_gate_backfill_sql$
      update public.leads
      set
        conversation_intent = coalesce(nullif(intake_profile #>> '{trace,intentGate,conversationIntent}', ''), conversation_intent),
        lead_eligible = case
          when intake_profile #>> '{trace,intentGate,leadEligible}' in ('true', 'false')
            then (intake_profile #>> '{trace,intentGate,leadEligible}')::boolean
          else lead_eligible
        end,
        conversation_route = coalesce(nullif(intake_profile #>> '{trace,intentGate,conversationRoute}', ''), conversation_route),
        intent_confidence = case
          when intake_profile #>> '{trace,intentGate,confidence}' ~ '^(0(\.[0-9]+)?|1(\.0+)?)$'
            then (intake_profile #>> '{trace,intentGate,confidence}')::numeric
          else intent_confidence
        end,
        intent_reason_codes = coalesce(intake_profile #> '{trace,intentGate,reasonCodes}', intent_reason_codes),
        intent_classifier_version = coalesce(nullif(intake_profile #>> '{trace,intentGate,classifierVersion}', ''), intent_classifier_version),
        intent_classified_at = coalesce(nullif(intake_profile #>> '{trace,intentGate,classifiedAt}', '')::timestamptz, intent_classified_at),
        non_sales_acknowledged_at = coalesce(nullif(intake_profile #>> '{trace,intentGate,nonSalesAcknowledgedAt}', '')::timestamptz, non_sales_acknowledged_at),
        latest_unanswered_question = coalesce(intake_profile #> '{trace,intentGate,latestUnansweredQuestion}', latest_unanswered_question),
        conversation_safety_state = coalesce(intake_profile #> '{trace,intentGate,conversationSafetyState}', conversation_safety_state)
      where coalesce(intake_profile #>> '{trace,intentGate,classifierVersion}', '') <> ''
        and intent_classifier_version = ''
    $intent_gate_backfill_sql$;
  end if;
end
$intent_gate_backfill$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_intent_confidence_range'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_intent_confidence_range
      check (intent_confidence >= 0 and intent_confidence <= 1);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_conversation_intent_taxonomy'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_conversation_intent_taxonomy
      check (conversation_intent in (
        'genuine_new_renovation_lead',
        'existing_client_project_message',
        'vendor_supplier_solicitation',
        'partnership_collaboration_outreach',
        'recruitment_job_enquiry',
        'spam_scam_irrelevant',
        'wrong_number_or_general_chat',
        'unclear_intent',
        'human_takeover_or_bot_paused',
        'existing_vendor_or_business_contact'
      ));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_conversation_route_taxonomy'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_conversation_route_taxonomy
      check (conversation_route in (
        'sales_lead',
        'existing_client',
        'vendor_inbox',
        'partnership_review',
        'recruitment_review',
        'spam_suppressed',
        'general_enquiry',
        'intent_review',
        'human_takeover',
        'business_contact'
      ));
  end if;
end $$;

create index if not exists leads_sales_eligible_active_idx
  on public.leads (updated_at desc)
  where lead_eligible = true
    and deleted_at is null
    and archived_at is null
    and coalesce(is_spam, false) = false;

create index if not exists leads_conversation_route_idx
  on public.leads (conversation_route, updated_at desc);

create index if not exists leads_conversation_intent_idx
  on public.leads (conversation_intent, updated_at desc);

comment on column public.leads.conversation_intent is 'v10.2.0 deterministic WhatsApp conversation intent. Manual override is stored separately.';
comment on column public.leads.lead_eligible is 'True only when the conversation is eligible for the renovation sales pipeline.';
comment on column public.leads.conversation_safety_state is 'One-time acknowledgement, semantic duplicate, and no-reply safety state. Raw messages remain in lead_messages.';
