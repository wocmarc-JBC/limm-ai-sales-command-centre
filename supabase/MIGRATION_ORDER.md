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

## After All Migrations

Run:

```powershell
npm run verify:live-supabase
```
