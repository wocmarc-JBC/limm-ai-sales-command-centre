# Supabase Migration Order

Run these migrations in order in the Supabase SQL Editor or via the Supabase CLI.

## 001_profiles.sql

Purpose: Create internal user profiles table.
Dependencies: none.
Safe to re-run: Yes, table creation uses `if not exists`.
Verification query:

```sql
select column_name from information_schema.columns where table_name = 'profiles';
```

## 002_leads.sql

Purpose: Create lead CRM table.
Dependencies: none.
Safe to re-run: Yes.
Verification query:

```sql
select column_name from information_schema.columns where table_name = 'leads';
```

## 003_lead_messages.sql

Purpose: Store lead conversation messages.
Dependencies: `leads`.
Safe to re-run: Yes.
Verification query:

```sql
select column_name from information_schema.columns where table_name = 'lead_messages';
```

## 004_lead_ai_decisions.sql

Purpose: Store structured AI decision outputs.
Dependencies: `leads`.
Safe to re-run: Yes.
Verification query:

```sql
select column_name from information_schema.columns where table_name = 'lead_ai_decisions';
```

## 005_appointments.sql

Purpose: Store appointment proposals and confirmed appointment records.
Dependencies: `leads`.
Safe to re-run: Yes.
Verification query:

```sql
select column_name from information_schema.columns where table_name = 'appointments';
```

## 006_appointment_rules.sql

Purpose: Store configurable appointment rules.
Dependencies: none.
Safe to re-run: Yes.
Verification query:

```sql
select column_name from information_schema.columns where table_name = 'appointment_rules';
```

## 007_appointment_slots.sql

Purpose: Store generated or configured appointment slots.
Dependencies: none.
Safe to re-run: Yes.
Verification query:

```sql
select column_name from information_schema.columns where table_name = 'appointment_slots';
```

## 008_appointment_holds.sql

Purpose: Store temporary appointment holds.
Dependencies: `leads`.
Safe to re-run: Yes.
Verification query:

```sql
select column_name from information_schema.columns where table_name = 'appointment_holds';
```

## 009_followups.sql

Purpose: Store follow-up tasks.
Dependencies: `leads`.
Safe to re-run: Yes.
Verification query:

```sql
select column_name from information_schema.columns where table_name = 'followups';
```

## 010_approval_requests.sql

Purpose: Store boss/admin approval requests.
Dependencies: `leads`, `profiles`.
Safe to re-run: Yes.
Verification query:

```sql
select column_name from information_schema.columns where table_name = 'approval_requests';
```

## 011_client_files.sql

Purpose: Track client file placeholders and future storage links.
Dependencies: `leads`.
Safe to re-run: Yes.
Verification query:

```sql
select column_name from information_schema.columns where table_name = 'client_files';
```

## 012_quotation_readiness.sql

Purpose: Store quotation readiness without pricing.
Dependencies: `leads`.
Safe to re-run: Yes.
Verification query:

```sql
select column_name from information_schema.columns where table_name = 'quotation_readiness';
```

## 013_audit_logs.sql

Purpose: Store audit logs for important actions.
Dependencies: none.
Safe to re-run: Yes.
Verification query:

```sql
select column_name from information_schema.columns where table_name = 'audit_logs';
```

## 014_settings_templates_outcomes.sql

Purpose: Create settings, message templates, and lead outcomes.
Dependencies: `leads`.
Safe to re-run: Yes.
Verification query:

```sql
select table_name from information_schema.tables where table_name in ('settings','message_templates','lead_outcomes');
```

## 015_v3_1_persistence_updates.sql

Purpose: Add v3.1 persistence fields and indexes.
Dependencies: migrations 001 through 014.
Safe to re-run: Yes. Uses `add column if not exists`, `create index if not exists`, and guarded constraint creation.
Verification query:

```sql
select indexname from pg_indexes where schemaname = 'public' and indexname in ('leads_status_idx','followups_due_at_idx','audit_logs_created_at_idx');
```

## 016_v3_2_auth_rls.sql

Purpose: Add role model, auth profile link, helper functions, and RLS policies.
Dependencies: migrations 001 through 015 and Supabase Auth.
Safe to re-run: Yes for policies/functions. Constraint sections are guarded.
Verification query:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('profiles','leads','audit_logs','appointment_rules');
```

## 017_v3_4_audit_log_actor_compatibility.sql

Purpose: Lock in the live Supabase audit log compatibility fix for schemas that require the legacy `actor` column while app code writes `actor_type` and `actor_name`.
Dependencies: migrations 013, 015, and 016.
Safe to re-run: Yes. Uses `add column if not exists`, `create or replace function`, and `drop trigger if exists`.
Verification query:

```sql
select column_name
from information_schema.columns
where table_name = 'audit_logs'
and column_name in ('actor','actor_type','actor_name','actor_email','actor_id','metadata');
```

## 017_v4_0_audit_log_actor_compatibility.sql

Purpose: v4.0 launch-candidate lock for the same live audit log actor compatibility fix, kept as an idempotent migration so fresh live projects capture the manual Supabase fix permanently.
Dependencies: migrations 013, 015, and 016.
Safe to re-run: Yes. Uses `add column if not exists`, `create or replace function`, and `drop trigger if exists`.
Verification query:

```sql
select column_name
from information_schema.columns
where table_name = 'audit_logs'
and column_name in ('actor','actor_type','actor_name','actor_email','actor_id','metadata');
```

## 018_v4_8_whatsapp_closed_test.sql

Purpose: Add WhatsApp closed-test message metadata, provider message-id dedupe, and status indexes for live inbound/reply-only testing.
Dependencies: migrations 002, 003, 016, and 017.
Safe to re-run: Yes. Uses `add column if not exists` and `create index if not exists`.
Verification query:

```sql
select column_name
from information_schema.columns
where table_name = 'lead_messages'
and column_name in ('provider_message_id','provider_timestamp','whatsapp_status','metadata');
```

## 019_v6_ultimate_command_centre.sql

Purpose: Add v6 Ultimate command-centre fields for safe soft delete/restore, boss/admin hard-delete gating, bot pause/resume, human takeover, lead scoring, mission queue, and summaries.
Dependencies: migrations 002, 013, 016, and 018.
Safe to re-run: Yes. Uses `add column if not exists` and `create index if not exists`.
Verification query:

```sql
select column_name
from information_schema.columns
where table_name = 'leads'
and column_name in ('deleted_at','is_test','is_spam','bot_paused','needs_marcus','lead_level','conversation_summary','mission_category');
```

## 020_v6_3_sales_collection_command_centre.sql

Purpose: Add v6.3 manual sales pipeline, quotation tracking, monthly boss targets, project/account records, and collection/payment tracking for the non-GST internal command centre.
Dependencies: migrations 002, 013, 016, 018, and 019.
Safe to re-run: Yes. Uses `add column if not exists`, `create table if not exists`, guarded constraints, `create index if not exists`, and policy recreation.
Verification query:

```sql
select column_name
from information_schema.columns
where table_name = 'leads'
and column_name in ('sales_stage','quotation_status','quoted_amount','confirmed_value','project_id');

select table_name
from information_schema.tables
where table_schema = 'public'
and table_name in ('project_accounts','payment_records','monthly_targets');
```

## 021_v6_4_singapore_mission_map.sql

Purpose: Add optional privacy-safe Singapore location metadata for dashboard area heatmap and clickable pins.
Dependencies: migrations 002, 016, 019, and 020 if project/account map layers are used.
Safe to re-run: Yes. Uses `add column if not exists` and `create index if not exists`.
Verification query:

```sql
select column_name
from information_schema.columns
where table_name = 'leads'
and column_name in ('property_area','postal_code','project_address','planning_region','planning_area','map_lat','map_lng','location_confidence','location_source');

select column_name
from information_schema.columns
where table_name = 'project_accounts'
and column_name in ('property_area','postal_code','project_address','planning_region','planning_area','map_lat','map_lng','location_confidence','location_source');
```

## 022_v6_5_smart_lead_intake.sql

Purpose: Add a structured JSONB intake profile for lifestyle, occupants, helper, pets, safety needs, budget expectation, timeline, key collection, move-in date, missing-info questions, meeting readiness, proposal readiness, and audit trace support.
Dependencies: migrations 002, 016, 019, 020, and 021.
Safe to re-run: Yes. Uses `add column if not exists` and `create index if not exists`.
Verification query:

```sql
select column_name
from information_schema.columns
where table_name = 'leads'
and column_name = 'intake_profile';
```

## 023_v6_7_real_client_file_upload.sql

Purpose: Add private lead file records, secure upload-link token hashes, and private `client-files` storage bucket setup for real Client Files.
Dependencies: migrations 002, 016, 019, 020, 021, 022, and Supabase Storage.
Safe to re-run: Yes. Uses `create table if not exists`, `create index if not exists`, and private bucket upsert when the `storage` schema is available.
Verification query:

```sql
select column_name
from information_schema.columns
where table_name = 'lead_files';

select column_name
from information_schema.columns
where table_name = 'lead_upload_links';

select id, public
from storage.buckets
where id = 'client-files';
```

## 024_quotation_packages.sql

Purpose: Add versioned quotation packages for draft upload, boss review, manual sent/accepted tracking, and private quotation file metadata.
Dependencies: migrations 002, 013, 016, 020, and 023.
Safe to re-run: Yes. Uses `create table if not exists`, `create index if not exists`, and guarded policies.
Verification query:

```sql
select column_name
from information_schema.columns
where table_name = 'quotation_packages';
```

## 025_qa_downstream_test_flags.sql

Purpose: Add QA/demo test flags for downstream project/account and payment records so QA workflow simulations stay hidden from normal production collection and delivery views.
Dependencies: migrations 020 and 024.
Safe to re-run: Yes. Uses `add column if not exists`, `create index if not exists`, and comments only.
Verification query:

```sql
select table_name, column_name
from information_schema.columns
where table_name in ('project_accounts','payment_records')
and column_name = 'is_test';

select indexname
from pg_indexes
where schemaname = 'public'
and indexname in ('project_accounts_is_test_idx','payment_records_is_test_idx');
```

## 026_project_accounts_location_fields.sql

Purpose: Add project/account location fields required by downstream QA project creation, delivery gates, and map-safe project/account views.
Dependencies: migrations 020, 021, 024, and 025.
Safe to re-run: Yes. Uses `add column if not exists`, guarded `create index if not exists`, and comments only.
Verification query:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
and table_name = 'project_accounts'
and column_name in (
  'property_area',
  'postal_code',
  'project_address',
  'planning_region',
  'planning_area',
  'map_lat',
  'map_lng',
  'location_confidence',
  'location_source',
  'location_notes'
);

select indexname
from pg_indexes
where schemaname = 'public'
and indexname = 'project_accounts_location_idx';
```

## 027_v10_2_intent_gate_conversation_safety.sql

Purpose: Add v10.2.0 WhatsApp intent, sales eligibility, conversation routing, one-time acknowledgement, latest-unanswered-question, and semantic reply-safety state to leads.
Dependencies: migrations 002, 015, 018, 019, 020, and 022.
Safe to re-run: Yes. Uses `add column if not exists`, guarded constraint creation, and `create index if not exists`.
Verification query:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'leads'
  and column_name in (
    'conversation_intent',
    'lead_eligible',
    'conversation_route',
    'intent_confidence',
    'intent_reason_codes',
    'intent_classifier_version',
    'intent_manual_override',
    'intent_classified_at',
    'non_sales_acknowledged_at',
    'latest_unanswered_question',
    'conversation_safety_state'
  );
```

## After All Migrations

Run:

```powershell
npm run verify:live-supabase
```
