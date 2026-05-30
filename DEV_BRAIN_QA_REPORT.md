# Dev Brain QA Report

## Status

FAIL

## Environment

- Node: v24.16.0
- npm detected: yes
- .env.local present: yes
- Supabase public env detected: yes
- Authenticated credentials present: no
- OpenAI: disabled
- WhatsApp: closed-test disabled by default
- Calendar: disabled

## Routes Tested

- /appointments (mobile-chromium)
- /appointment-settings (mobile-chromium)

## Browser QA Completed

No.
Report: V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md

## Auth Tested

No. Authenticated browser/write testing is MANUAL REQUIRED until SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are set.

## Buttons Tested / Verified

- No button inventory recorded.

## Functions Tested

- SKIP: live Supabase schema verifier - Live network may be blocked in this runner.
- MANUAL REQUIRED: authenticated live actions verifier - Set SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD for a test boss user.
- FAIL: Playwright browser QA - exit 1

## Parameters Tested

- Appointment days including Sunday configurable behavior.
- Appointment type controls.
- Minimum notice, max-per-day, buffer, same-day rule, public holiday rule, and boss approval rule coverage through static/Playwright-ready checks.
- Quotation readiness score, missing info, boss review flag, and checklist safety.
- Approval gate matrix for price, timeline, authority, landed, commercial, structural, complaint, discount, special timing, risky visit, and high-value rejection.

## Forms Tested / Verified

- No form inventory recorded.

## Screenshots Captured

- screenshots\v4_2_browser_human_test_2026-05-30T08-44-22-168Z\mobile-chromium-route-appointments.png
- screenshots\v4_2_browser_human_test_2026-05-30T08-44-22-168Z\mobile-chromium-failed-route-appointment-settings.png

## Traces Captured

- screenshots/v4_2_browser_human_test_2026-05-30T08-44-22-168Z/traces/1780130983966-trace.zip

## Bugs Found

- Playwright browser QA failed. See V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md for exact reason.

## Bugs Fixed

- None.

## Bugs Remaining

- Playwright browser QA must pass before v4.2 can be marked done.

## Safety Rule Result

- No client-facing forbidden consultation wording in checked reply surfaces.
- No generated prices, amount ranges, or rough renovation estimates in checked reply surfaces.
- Sunday remains settings-controlled.
- OpenAI live actions, public WhatsApp auto-reply, and Calendar booking remain disabled.
- WhatsApp closed-test auto-reply is allowed only when Marcus intentionally enables all v4.8 safety flags.
- Audit logs are not deleted by normal actions.

## Tests / Audit Run

- SKIP: live Supabase schema verifier
- MANUAL REQUIRED: authenticated live actions verifier
- FAIL: Playwright browser QA

## Go / No-Go Recommendation

NO-GO until failed checks are fixed.

## Next Codex Task Suggestion

Fix Playwright browser QA and rerun npm.cmd run qa:browser before moving forward.

## Paste This To ChatGPT

```text
LIMM AI Sales Command Centre Dev Brain QA status: FAIL.
Auth tested: manual required.
OpenAI live actions, public WhatsApp auto-reply, and Calendar booking remain disabled. No pricing or quote ranges were added.
Go/No-Go: NO-GO until failed checks are fixed.
Recommended next Codex task: Fix Playwright browser QA and rerun npm.cmd run qa:browser before moving forward.
```
