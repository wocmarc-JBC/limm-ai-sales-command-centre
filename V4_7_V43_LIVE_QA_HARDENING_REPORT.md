# v4.7 / v4.3 Live QA Hardening Report

Status: PASS for local static/package validation. Authenticated live v4.3 browser write rerun requires Marcus credentials and should be rerun in Marcus PowerShell.

## Root Cause

Marcus's headed v4.3 run reached the authenticated write spec, but the spec was one large test with the default 30-second Playwright timeout. It performed login, multiple live writes, persistence reloads, repeated audit checks, screenshots, audit-log navigation, and logout inside one timeout window. Playwright closed the browser when the test exceeded 30 seconds while navigating to `/audit-log`.

## Fix Made

- Split the v4.3 boss-write QA into focused serial tests:
  - login + appointment settings + audit
  - lead status + audit
  - approval decision + audit
  - follow-up snooze + audit
  - quotation readiness + audit
  - audit-log route + logout/protected route
- Increased the v4.3 serial spec timeout to 90 seconds per focused test.
- Optimized audit verification:
  - Polls Supabase audit rows directly first.
  - Keeps strict actor, actor_id, and marker checks.
  - Checks `/audit-log` UI route once after audit row existence is confirmed.
- Added step-level JSONL progress records so timeout failures show the last running/passed step.

## Audit Strictness

Audit checks were not weakened. They still require:

- Audit record exists.
- `actor` or `actor_name` is populated.
- `actor_id` is populated.
- Marker metadata matches for appointment settings.
- Audit-log UI has no delete button.

## Safety Status

- OpenAI dry-run remains off by default.
- WhatsApp live sending remains disabled.
- Calendar live booking remains disabled.
- No auto-send.
- No auto-booking.
- No pricing, quote ranges, rough estimates, package prices, or generated amounts.
- Review route remains disabled by default.

## Marcus Rerun Command

```powershell
npx.cmd playwright test tests/e2e/v4-3-auth-boss-write.spec.ts --project=desktop-chromium --headed
```

## Tests Run Locally

Local tests that do not require Marcus's live test password were run after the hardening change. Final results are listed in the task response.

## Remaining Limitation

Authenticated v4.3 live write verification must be rerun by Marcus with `SUPABASE_TEST_EMAIL` and `SUPABASE_TEST_PASSWORD` present.
