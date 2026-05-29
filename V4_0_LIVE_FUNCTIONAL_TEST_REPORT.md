# V4.0 Live Functional Test Report

## Status

PASS with manual authenticated-write verification still required.

## Environment Tested

- Project: `C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3`
- Local app started through `START_LIMM_SALES_APP.ps1`.
- Port 3000 was already busy, so Next.js started on `http://localhost:3001`.
- `.env.local` was present. Values were not printed.
- Supabase URL and anon key variable names were detected.
- OpenAI, WhatsApp, and Google Calendar remained disabled.

## Supabase Mode Status

Supabase Mode was detected by the app shell when `.env.local` was present.

Live schema verification attempted with `.env.local` values loaded into process environment. This Codex runner could not complete the Supabase network request, so the verifier now exits cleanly with:

`SKIP: live Supabase network check could not complete within timeout. Static schema/RLS checks passed; retry from a network-enabled shell.`

## Auth Status

- Login page rendered.
- Login page shell no longer shows protected-page warning copy.
- Protected pages rendered the unauthenticated protection state.
- Protected pages showed `Login required` and `Go to Login`.
- Protected pages did not show `Logout`.
- Authenticated boss login/write testing was skipped because `SUPABASE_TEST_EMAIL` and `SUPABASE_TEST_PASSWORD` were not available in this runner.

## Routes Tested

- `/`
- `/login`
- `/leads`
- `/leads/lead-001`
- `/appointments`
- `/appointment-settings`
- `/approvals`
- `/followups`
- `/quotation-readiness`
- `/client-files`
- `/reports`
- `/settings`
- `/audit-log`
- `/review-chatgpt-ui`

All routes returned HTTP 200 with no server crash or forbidden client-facing safety wording in the rendered HTML probe.

## Functions Tested

- Startup script execution.
- Protected route unauthenticated handling.
- Login page rendering.
- Review route rendering.
- Static repository/action tests.
- Mock fallback tests.
- Supabase/Auth/RLS static tests.
- Appointment/Sunday static tests.
- Review route safety tests.
- v4 launch candidate tests.
- Package audit after generated-folder cleanup.

## Data Actions Tested

Static and mock-mode tests covered lead, approval, follow-up, quotation readiness, appointment settings, and audit repository behavior.

Live authenticated writes were not executed because test credentials were not available to Codex. No real client data was used.

## Audit Log Result

- Audit actor compatibility migration exists.
- Audit inserts include actor fields where practical.
- Normal app actions do not delete audit logs.
- Live authenticated audit writes still need Marcus to rerun with test credentials from a network-enabled shell.

## Appointment / Sunday Result

- Appointment settings remain config-controlled.
- No hardcoded Sunday block was found.
- Review-route Sunday example uses an actual Sunday date.
- Live save/refresh of Sunday settings needs authenticated boss credentials.

## Quotation Safety Result

- No auto-generated prices.
- No amount ranges.
- No rough renovation estimates.
- Quotation readiness remains checklist/readiness based.
- Safe client reply direction asks for floor plan, photos, scope, and boss review before quotation discussion.

## Approval Gate Result

- Approval gate matrix exists.
- Risky actions require Marcus approval in the static matrix.
- Approval queue renders safely in protected mode.
- Live approve/reject/request-more-info actions need authenticated boss credentials.

## Follow-Up Result

- Follow-up queue renders safely in protected mode.
- Static repository/action tests cover follow-up behavior and audit logging.
- Live complete/snooze/no-reply actions need authenticated boss credentials.

## Client Files Result

- Client Files page renders safely in protected mode.
- Review route includes Client Files Preview.
- Upload behavior remains clearly placeholder-only.
- No real client files or Supabase Storage writes were exposed.

## System Health Result

Settings/system health route renders in protected mode.

System health includes mode, auth, role, Supabase status, audit/appointment writability status, RLS status, environment, and disabled integrations.

## Review Route Result

- No login required.
- Mock data only.
- No live writes.
- No protected nav links.
- Actions are preview-only/disabled.
- No pricing.
- No amount ranges.
- No forbidden consultation phrase.
- Sunday example is an actual Sunday.
- Commercial clinic mock lead is LIMM Works.
- Client Files Preview exists.

## Bugs Found

1. Startup script initially failed in this runner when npm was missing from PATH.
2. Startup script initially hit a Windows Node app-alias access issue.
3. Login page shell showed `Login required` and `Go to Login`, which was confusing on the login page itself.
4. Live Supabase schema verifier could hang when network access was blocked.
5. Port 3000 was already busy; Next.js correctly moved to port 3001.
6. Static package tests fail when generated folders are present, so generated folders must be removed before final audit.

## Bugs Fixed

1. Startup script now resolves `npm.cmd` when available and can start from the installed Next binary when npm is absent.
2. Startup script now validates the Node executable and falls back to the bundled runtime in this runner when needed.
3. Login route shell now shows `Secure sign-in` instead of protected-page warning copy.
4. Live Supabase schema verifier now has timeout handling and exits cleanly when network verification cannot complete.
5. v4 launch test now checks the login shell fix.

## Bugs Remaining

1. Authenticated live writes were not executed because test credentials were not available.
2. Live Supabase network verification was blocked by this runner's network restrictions.
3. Browser automation could not attach in this environment, so route/UI checks were done through live HTTP probes rather than screenshots.
4. `START_LIMM_SALES_APP.bat` was not separately live-run to avoid starting another dev server; it remains a wrapper for the tested PowerShell startup script.

## Screenshots

No screenshots were captured because browser automation could not attach in this runner.

## Tests Run

- `node scripts/doctor.mjs`
- `node scripts/test_v3_foundation.mjs`
- `node scripts/test_v3_supabase_layer.mjs`
- `node scripts/test_v3_auth_rls_static.mjs`
- `node scripts/test_v3_live_setup_static.mjs`
- `node scripts/test_v3_review_route_static.mjs`
- `node scripts/test_v4_launch_candidate.mjs`
- `node scripts/audit_v3_package.mjs`
- `node scripts/verify_live_supabase_schema.mjs`
- `node scripts/verify_live_authenticated_actions.mjs`
- Live route HTTP probe against `http://localhost:3001`

## Audit Result

PASS after generated runtime folders were removed.

## Go / No-Go Recommendation

GO for Marcus internal launch-candidate testing.

NO-GO for public production until authenticated live action testing is completed with Marcus boss credentials, review route is removed or locked down, and production backup/monitoring is confirmed.

## What Marcus Must Manually Verify

1. Set `SUPABASE_TEST_EMAIL` and `SUPABASE_TEST_PASSWORD` for a test boss user.
2. Run `node scripts/verify_live_authenticated_actions.mjs`.
3. Login through `/login`.
4. Confirm role shows boss.
5. Save appointment settings and verify Sunday persistence.
6. Update a test lead.
7. Approve/reject/request more info on a test approval.
8. Complete/snooze a test follow-up.
9. Confirm audit log actor fields populate.
10. Confirm no real client data is used during testing.

## Recommended Next Phase

v4.1: authenticated live boss smoke test, review-route removal/lockdown, deployment hardening, and production backup/monitoring setup.
