# V3.2 Supabase Auth/RLS Report

## Status

PASS

## Files Changed

- `package.json`
- `.env.example`
- `components/Shell.tsx`
- `components/auth/AuthGate.tsx`
- `components/auth/LoginForm.tsx`
- `components/auth/LogoutButton.tsx`
- `app/login/page.tsx`
- `app/settings/page.tsx`
- `app/approvals/page.tsx`
- `app/appointment-settings/page.tsx`
- `app/audit-log/page.tsx`
- `lib/auth/roles.ts`
- `lib/auth/session.ts`
- `lib/actions.ts`
- `lib/data/data-source.ts`
- `lib/data/supabase-browser.ts`
- `lib/data/supabase-server.ts`
- `lib/types.ts`
- `supabase/migrations/016_v3_2_auth_rls.sql`
- `supabase/seed.sql`
- `scripts/test_v3_auth_rls_static.mjs`
- `scripts/verify_live_supabase_schema.mjs`
- `scripts/audit_v3_package.mjs`
- project docs

## Auth Foundation Status

Supabase Auth foundation has been added. Mock Mode allows demo boss access. Supabase Mode requires login through the login page and checks the current profile.

## Role Model Status

Roles are defined as:

- boss
- admin
- sales
- viewer

Server actions use `requirePermission` for sensitive actions.

## RLS Policy Status

`016_v3_2_auth_rls.sql` enables RLS for all core tables and adds role-aware policies. Policies target authenticated users and do not add anonymous access policies. Audit logs have insert/select policies only and no delete/update policy.

## Login/Logout UI Status

Added `/login` with email/password UI for Supabase Mode and demo access for Mock Mode. The app shell shows current user/role and includes logout.

## Mock Mode Status

Mock Mode still works without Supabase env vars and uses demo boss access.

## Supabase Mode Status

Prepared. Requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, migrations applied, and profiles bootstrapped for real users.

## Live Schema Verification Status

`scripts/verify_live_supabase_schema.mjs` exits cleanly in Mock Mode. In Supabase Mode, it checks required tables/columns and treats RLS-protected reads as expected protection.

## Service Role Safety Result

`SUPABASE_SERVICE_ROLE_KEY` is not imported or referenced in app/component/lib TypeScript. It remains documented as server/script-only future usage.

## Appointment/Sunday Configurable Proof

Sunday remains controlled by appointment settings. There is no hardcoded Sunday block in the appointment engine.

## Quotation Safety Proof

Quotation readiness still uses readiness score, missing info, boss review flag, and checklist only. No prices, quote ranges, or rough renovation estimates are generated.

## Tests Run

- `node scripts/test_v3_foundation.mjs`
- `node scripts/test_v3_supabase_layer.mjs`
- `node scripts/test_v3_auth_rls_static.mjs`
- `node scripts/verify_live_supabase_schema.mjs`
- `node scripts/audit_v3_package.mjs`

## Audit Result

PASS

## Remaining Limitations

- A real Supabase project has not been connected in this repo.
- Real users must be created in the Supabase dashboard.
- RLS/Auth behavior must be tested against live Supabase users before production.
- OpenAI, WhatsApp, and calendar integrations remain disabled.
- Client file upload remains placeholder.

## Recommended Next Phase

v3.3 should connect a real Supabase project, run migrations, create Marcus/admin users, verify live login/RLS/repositories, and confirm audit-log writes with real authenticated users.
