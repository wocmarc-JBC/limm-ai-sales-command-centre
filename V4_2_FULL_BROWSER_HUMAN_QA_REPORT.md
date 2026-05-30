# v4.2 Full Browser Human QA Report

Run marker: v4_2_browser_human_test_2026-05-30T08-44-22-168Z
Generated: 2026-05-30T08:49:44.104Z

## Status PASS/FAIL

FAIL

## Browser QA Completed

No.

## Playwright Install Status

- @playwright/test package: missing
- Chromium browser: available or no missing-browser error detected
- Exact browser setup command for Marcus PowerShell: npm.cmd install, then npx.cmd playwright install chromium

## Authenticated Browser Test Status

MANUAL REQUIRED. SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD were not present; password was not printed or stored.

## Routes Tested

- /appointments (mobile-chromium)
- /appointment-settings (mobile-chromium)

## Buttons Clicked / Verified

- No visible buttons recorded.

## Forms / Parameters Tested

- No forms recorded.

## Screenshots Captured

Folder: screenshots/v4_2_browser_human_test_2026-05-30T08-44-22-168Z

- screenshots\v4_2_browser_human_test_2026-05-30T08-44-22-168Z\mobile-chromium-route-appointments.png
- screenshots\v4_2_browser_human_test_2026-05-30T08-44-22-168Z\mobile-chromium-failed-route-appointment-settings.png

## Traces Captured If Failures

- screenshots/v4_2_browser_human_test_2026-05-30T08-44-22-168Z/traces/1780130983966-trace.zip

## Bugs Found

- Playwright browser QA exited non-zero. See V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md and test-results/playwright.
- route human check /appointment-settings (mobile-chromium) failed: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeLessThan[2m([22m[32mexpected[39m[2m)[22m

Expected: < [32m500[39m
Received:   [31m500[39m
- Console error: /appointment-settings (mobile-chromium): Failed to load resource: the server responded with a status of 500 (Internal Server Error)
- Visible error text: /appointment-settings (mobile-chromium): Internal Server Error

## Bugs Fixed

- Fixed Playwright runner wiring to execute the Playwright CLI through the active Node executable instead of a fragile Windows .cmd node lookup.
- Added full v4.2 route-by-route browser QA coverage with screenshots, console-error capture, visible-error capture, responsive checks, review-route preview checks, and manual-auth reporting.
- Added v4.2 report generation with exact failure reason capture.

## Bugs Remaining

- Authenticated boss-write flows, persistence checks, and live audit-log write checks remain MANUAL REQUIRED until SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are supplied.
- Browser QA did not complete in this run. Fix the Playwright failure above and rerun npm.cmd run qa:browser.

## Safety Rule Result

- OpenAI live brain was not added.
- WhatsApp was not added.
- Google Calendar live booking was not added.
- Auto-pricing, quote ranges, and generated amounts were not added.
- Mock/review mode remains present.
- Audit rules were not weakened.
- Secrets and .env values were not printed.

## Supabase/Auth Result

Public/review and unauthenticated protected-route checks ran; authenticated checks are manual required.

## Audit Log Result

Audit log route protection was checked unauthenticated. Live audit-write verification remains manual required without test credentials.

## Appointment / Sunday Result

Review route verifies the 2026-05-31 Sunday example is an actual Sunday and that Sunday is settings-controlled. Full save/refresh persistence remains manual required without authenticated test credentials.

## Quotation Safety Result

Browser checks reject forbidden consultation wording and quotation/estimate range wording on checked surfaces. No auto-pricing feature was added.

## Mobile / Responsive Result

Desktop, tablet, and mobile Playwright projects are configured. Core responsive routes are checked for horizontal page scroll and captured as screenshots.

## Review Route Result

Review route is checked as disabled by default unless NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=true. When explicitly enabled for local UI review, it remains mock-only, no-live-actions, demo-data-only, preview-button-only, and internal-anchor navigation only.

## Repo Safety Search Findings

- .env.example:9 contains "service_role"
- .env.example:9 contains "SUPABASE_SERVICE_ROLE_KEY"
- AGENTS.md:55 contains "free consultation"
- AGENTS.md:54 contains "quote range"
- AGENTS.md:86 contains "service_role"
- AGENTS.md:86 contains "SUPABASE_SERVICE_ROLE_KEY"
- app/api/whatsapp/health/route.ts:24 contains "service_role"
- app/api/whatsapp/health/route.ts:24 contains "SUPABASE_SERVICE_ROLE_KEY"
- app/api/whatsapp/webhook/route.ts:33 contains "service_role"
- app/api/whatsapp/webhook/route.ts:33 contains "SUPABASE_SERVICE_ROLE_KEY"
- CURRENT_STATUS.md:57 contains "quote range"
- CURRENT_STATUS.md:57 contains "rough estimate"
- CURRENT_STATUS.md:57 contains "estimated price"
- CURRENT_STATUS.md:57 contains "package price"
- DEV_BRAIN_QA_REPORT.md:221 contains "quote range"
- INTERNAL_LAUNCH_CHECKLIST.md:63 contains "quote range"
- INTERNAL_LAUNCH_CHECKLIST.md:28 contains "rough estimate"
- INTERNAL_LAUNCH_CHECKLIST.md:63 contains "package price"
- KNOWN_LIMITATIONS.md:16 contains "quote range"
- KNOWN_LIMITATIONS.md:17 contains "rough estimate"
- LAUNCH_CHECKLIST.md:53 contains "quote range"
- lib/ai-dry-run.ts:12 contains "quote range"
- lib/ai-dry-run.ts:13 contains "price range"
- lib/ai-dry-run.ts:14 contains "rough estimate"
- lib/ai-dry-run.ts:16 contains "package price"
- lib/data/supabase-admin.ts:7 contains "service_role"
- lib/data/supabase-admin.ts:7 contains "SUPABASE_SERVICE_ROLE_KEY"
- lib/safety-rules.ts:2 contains "free consultation"
- lib/whatsapp-safety.ts:7 contains "free consultation"
- lib/whatsapp-safety.ts:6 contains "quote range"
- lib/whatsapp-safety.ts:6 contains "price range"
- lib/whatsapp-safety.ts:6 contains "rough estimate"
- lib/whatsapp-safety.ts:6 contains "estimated price"
- lib/whatsapp-safety.ts:6 contains "package price"
- LIVE_SUPABASE_SETUP_GUIDE.md:122 contains "quote range"
- META_WHATSAPP_WEBHOOK_LIVE_SETUP.md:93 contains "quote range"
- NEXT_PHASE_OPENAI_BRAIN_PLAN.md:14 contains "quote range"
- NEXT_PHASE_OPENAI_BRAIN_PLAN.md:15 contains "rough estimate"
- NEXT_STEPS_FOR_CHATGPT.md:19 contains "quote range"
- NEXT_STEPS_FOR_CHATGPT.md:20 contains "Sunday blocked"
- PRODUCTION_ENV_VARS_CHECKLIST.md:21 contains "service_role"
- PRODUCTION_ENV_VARS_CHECKLIST.md:21 contains "SUPABASE_SERVICE_ROLE_KEY"
- README.md:61 contains "quote range"
- README.md:68 contains "service_role"
- README.md:68 contains "SUPABASE_SERVICE_ROLE_KEY"
- scripts/audit_v3_package.mjs:217 contains "free consultation"
- scripts/audit_v3_package.mjs:210 contains "quote range"
- scripts/audit_v3_package.mjs:213 contains "package price"
- scripts/audit_v3_package.mjs:170 contains "service_role"
- scripts/audit_v3_package.mjs:170 contains "SUPABASE_SERVICE_ROLE_KEY"
- scripts/dev_brain_route_probe.mjs:33 contains "free consultation"
- scripts/dev_brain_route_probe.mjs:33 contains "quote range"
- scripts/dev_brain_route_probe.mjs:33 contains "rough estimate"
- scripts/dev_brain_route_probe.mjs:33 contains "estimated price"
- scripts/doctor.mjs:115 contains "free consultation"
- scripts/doctor.mjs:112 contains "quote range"
- scripts/doctor.mjs:112 contains "rough estimate"
- scripts/doctor.mjs:112 contains "package price"
- scripts/doctor.mjs:100 contains "service_role"
- scripts/doctor.mjs:100 contains "SUPABASE_SERVICE_ROLE_KEY"
- scripts/doctor.mjs:123 contains "hardcoded Sunday"
- scripts/generate_dev_brain_report.mjs:145 contains "quote range"
- scripts/generate_v4_2_browser_report.mjs:85 contains "free consultation"
- scripts/generate_v4_2_browser_report.mjs:86 contains "quote range"
- scripts/generate_v4_2_browser_report.mjs:87 contains "price range"
- scripts/generate_v4_2_browser_report.mjs:88 contains "rough estimate"
- scripts/generate_v4_2_browser_report.mjs:89 contains "estimated price"
- scripts/generate_v4_2_browser_report.mjs:90 contains "package price"
- scripts/generate_v4_2_browser_report.mjs:91 contains "service_role"
- scripts/generate_v4_2_browser_report.mjs:92 contains "SUPABASE_SERVICE_ROLE_KEY"
- scripts/generate_v4_2_browser_report.mjs:93 contains "Sunday blocked"
- scripts/generate_v4_2_browser_report.mjs:94 contains "hardcoded Sunday"
- scripts/test_v3_auth_rls_static.mjs:144 contains "free consultation"
- scripts/test_v3_auth_rls_static.mjs:149 contains "quote range"
- scripts/test_v3_auth_rls_static.mjs:136 contains "service_role"
- scripts/test_v3_auth_rls_static.mjs:136 contains "SUPABASE_SERVICE_ROLE_KEY"
- scripts/test_v3_auth_rls_static.mjs:140 contains "hardcoded Sunday"
- scripts/test_v3_foundation.mjs:80 contains "free consultation"
- scripts/test_v3_foundation.mjs:86 contains "quote range"
- scripts/test_v3_foundation.mjs:89 contains "package price"
- scripts/test_v3_live_setup_static.mjs:158 contains "free consultation"
- scripts/test_v3_live_setup_static.mjs:163 contains "quote range"
- scripts/test_v3_live_setup_static.mjs:106 contains "service_role"
- scripts/test_v3_live_setup_static.mjs:106 contains "SUPABASE_SERVICE_ROLE_KEY"
- scripts/test_v3_live_setup_static.mjs:154 contains "hardcoded Sunday"
- scripts/test_v3_review_route_static.mjs:43 contains "free consultation"
- scripts/test_v3_review_route_static.mjs:44 contains "quote range"
- scripts/test_v3_review_route_static.mjs:44 contains "rough estimate"
- scripts/test_v3_review_route_static.mjs:44 contains "package price"
- scripts/test_v3_supabase_layer.mjs:119 contains "free consultation"
- scripts/test_v3_supabase_layer.mjs:113 contains "quote range"
- scripts/test_v3_supabase_layer.mjs:56 contains "service_role"
- scripts/test_v3_supabase_layer.mjs:56 contains "SUPABASE_SERVICE_ROLE_KEY"
- scripts/test_v4_1_dev_brain_static.mjs:105 contains "quote range"
- scripts/test_v4_1_dev_brain_static.mjs:105 contains "rough estimate"
- scripts/test_v4_1_dev_brain_static.mjs:76 contains "service_role"
- scripts/test_v4_6_openai_dry_run.mjs:57 contains "quote range"
- scripts/test_v4_6_openai_dry_run.mjs:57 contains "rough estimate"
- scripts/test_v4_6_openai_dry_run.mjs:57 contains "package price"
- scripts/test_v4_7_openai_boss_review_ux.mjs:133 contains "free consultation"
- scripts/test_v4_7_openai_boss_review_ux.mjs:110 contains "quote range"
- scripts/test_v4_7_openai_boss_review_ux.mjs:111 contains "rough estimate"
- scripts/test_v4_7_openai_boss_review_ux.mjs:112 contains "package price"
- scripts/test_v4_8_live_diagnostics_static.mjs:91 contains "service_role"
- scripts/test_v4_8_live_diagnostics_static.mjs:91 contains "SUPABASE_SERVICE_ROLE_KEY"
- scripts/test_v4_8_whatsapp_closed_test.mjs:104 contains "free consultation"
- scripts/test_v4_8_whatsapp_closed_test.mjs:105 contains "quote range"
- scripts/test_v4_8_whatsapp_closed_test.mjs:106 contains "rough estimate"
- scripts/test_v4_8_whatsapp_closed_test.mjs:107 contains "package price"
- scripts/test_v4_9_deployment_readiness.mjs:177 contains "free consultation"
- scripts/test_v4_9_deployment_readiness.mjs:181 contains "quote range"
- scripts/test_v4_9_deployment_readiness.mjs:183 contains "rough estimate"
- scripts/test_v4_9_deployment_readiness.mjs:184 contains "estimated price"
- scripts/test_v4_9_deployment_readiness.mjs:185 contains "package price"
- scripts/test_v4_9_deployment_readiness.mjs:72 contains "service_role"
- scripts/test_v4_9_deployment_readiness.mjs:72 contains "SUPABASE_SERVICE_ROLE_KEY"
- scripts/test_v4_launch_candidate.mjs:70 contains "free consultation"
- scripts/test_v4_launch_candidate.mjs:67 contains "quote range"
- scripts/test_v4_launch_candidate.mjs:67 contains "rough estimate"
- scripts/test_v4_launch_candidate.mjs:67 contains "package price"
- scripts/test_v4_launch_candidate.mjs:116 contains "service_role"
- scripts/test_v4_launch_candidate.mjs:116 contains "SUPABASE_SERVICE_ROLE_KEY"
- scripts/test_v4_launch_candidate.mjs:78 contains "hardcoded Sunday"
- scripts/verify_live_supabase_schema.mjs:54 contains "hardcoded Sunday"
- START_HERE_INTERNAL_LAUNCH.md:25 contains "quote range"
- START_HERE_INTERNAL_LAUNCH.md:26 contains "rough estimate"
- START_INTERNAL_LAUNCH_SAFE.ps1:15 contains "quote range"
- tests/e2e/authenticated-boss.spec.ts:21 contains "free consultation"
- tests/e2e/authenticated-boss.spec.ts:21 contains "quote range"
- tests/e2e/authenticated-boss.spec.ts:21 contains "rough estimate"
- tests/e2e/login.spec.ts:18 contains "service_role"
- tests/e2e/protected-routes.spec.ts:23 contains "free consultation"
- tests/e2e/protected-routes.spec.ts:23 contains "quote range"
- tests/e2e/protected-routes.spec.ts:23 contains "rough estimate"
- tests/e2e/review-route.spec.ts:33 contains "free consultation"
- tests/e2e/review-route.spec.ts:34 contains "quote range"
- tests/e2e/review-route.spec.ts:34 contains "rough estimate"
- tests/e2e/route-checks.spec.ts:32 contains "free consultation"
- tests/e2e/route-checks.spec.ts:32 contains "quote range"
- tests/e2e/route-checks.spec.ts:32 contains "rough estimate"
- tests/e2e/v4-2-human-browser.spec.ts:13 contains "free consultation"
- tests/e2e/v4-2-human-browser.spec.ts:13 contains "quote range"
- tests/e2e/v4-2-human-browser.spec.ts:13 contains "price range"
- tests/e2e/v4-2-human-browser.spec.ts:13 contains "rough estimate"
- tests/e2e/v4-2-human-browser.spec.ts:13 contains "estimated price"
- tests/e2e/v4-2-human-browser.spec.ts:13 contains "package price"
- tests/e2e/v4-3-auth-boss-write.spec.ts:12 contains "free consultation"
- tests/e2e/v4-3-auth-boss-write.spec.ts:12 contains "quote range"
- tests/e2e/v4-3-auth-boss-write.spec.ts:12 contains "price range"
- tests/e2e/v4-3-auth-boss-write.spec.ts:12 contains "rough estimate"
- tests/e2e/v4-3-auth-boss-write.spec.ts:12 contains "estimated price"
- tests/e2e/v4-3-auth-boss-write.spec.ts:12 contains "package price"
- tests/v3_foundation_cases.md:10 contains "quote range"
- V3_0_BUILD_REPORT.md:81 contains "quote range"
- V3_0_BUILD_REPORT.md:90 contains "hardcoded Sunday"
- V3_1_SUPABASE_LAYER_REPORT.md:93 contains "quote range"
- V3_1_SUPABASE_LAYER_REPORT.md:77 contains "hardcoded Sunday"
- V3_2_SUPABASE_AUTH_RLS_REPORT.md:79 contains "quote range"
- V3_2_SUPABASE_AUTH_RLS_REPORT.md:71 contains "service_role"
- V3_2_SUPABASE_AUTH_RLS_REPORT.md:71 contains "SUPABASE_SERVICE_ROLE_KEY"
- V3_2_SUPABASE_AUTH_RLS_REPORT.md:75 contains "hardcoded Sunday"
- V3_3_LIVE_SUPABASE_VERIFICATION_REPORT.md:75 contains "quote range"
- V3_4A_REVIEW_ROUTE_UI_FIX_REPORT.md:66 contains "quote range"
- V3_4A_REVIEW_ROUTE_UI_FIX_REPORT.md:67 contains "rough estimate"
- V3_4A_REVIEW_ROUTE_UI_FIX_REPORT.md:68 contains "hardcoded Sunday"
- V4_0_LAUNCH_CANDIDATE_REPORT.md:110 contains "quote range"
- V4_0_LIVE_FUNCTIONAL_TEST_REPORT.md:82 contains "hardcoded Sunday"
- V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md:211 contains "free consultation"
- V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md:178 contains "quote range"
- V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md:227 contains "price range"
- V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md:216 contains "rough estimate"
- V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md:217 contains "estimated price"
- V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md:218 contains "package price"
- V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md:209 contains "service_role"
- V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md:210 contains "SUPABASE_SERVICE_ROLE_KEY"
- V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md:244 contains "Sunday blocked"
- V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md:265 contains "hardcoded Sunday"
- V4_3_AUTHENTICATED_BOSS_BROWSER_WRITE_QA_REPORT.md:70 contains "quote range"
- V4_3_AUTHENTICATED_BOSS_BROWSER_WRITE_QA_REPORT.md:70 contains "rough estimate"
- V4_3_AUTHENTICATED_BOSS_BROWSER_WRITE_QA_REPORT.md:70 contains "estimated price"
- V4_3_AUTHENTICATED_BOSS_BROWSER_WRITE_QA_REPORT.md:70 contains "package price"
- V4_4_PRODUCTION_LOCKDOWN_REPORT.md:80 contains "quote range"
- V4_4_PRODUCTION_LOCKDOWN_REPORT.md:80 contains "rough estimate"
- V4_4_PRODUCTION_LOCKDOWN_REPORT.md:80 contains "estimated price"
- V4_4_PRODUCTION_LOCKDOWN_REPORT.md:80 contains "package price"
- V4_5_INTERNAL_LAUNCH_PACKAGE_REPORT.md:30 contains "quote range"
- V4_5_INTERNAL_LAUNCH_PACKAGE_REPORT.md:31 contains "rough estimate"
- V4_6_OPENAI_BRAIN_DRY_RUN_REPORT.md:31 contains "quote range"
- V4_6_OPENAI_BRAIN_DRY_RUN_REPORT.md:32 contains "rough estimate"
- V4_7_V43_LIVE_QA_HARDENING_REPORT.md:42 contains "quote range"
- V4_7_V43_LIVE_QA_HARDENING_REPORT.md:42 contains "rough estimate"
- V4_7_V43_LIVE_QA_HARDENING_REPORT.md:42 contains "package price"
- V4_8_WHATSAPP_LIVE_CLOSED_TEST_REPORT.md:70 contains "rough estimate"
- V4_8_WHATSAPP_LIVE_CLOSED_TEST_REPORT.md:70 contains "package price"
- V4_8_WHATSAPP_LIVE_DIAGNOSTIC_FIX_REPORT.md:7 contains "service_role"
- V4_8_WHATSAPP_LIVE_DIAGNOSTIC_FIX_REPORT.md:7 contains "SUPABASE_SERVICE_ROLE_KEY"
- V4_9_LIVE_DEPLOYMENT_READINESS_REPORT.md:7 contains "quote range"
- V4_9_LIVE_DEPLOYMENT_READINESS_REPORT.md:7 contains "rough estimate"
- VERCEL_DEPLOYMENT_GUIDE.md:95 contains "quote range"
- VERCEL_DEPLOYMENT_GUIDE.md:52 contains "service_role"
- VERCEL_DEPLOYMENT_GUIDE.md:52 contains "SUPABASE_SERVICE_ROLE_KEY"
- WHATSAPP_AUTO_REPLY_SAFETY_RULES.md:22 contains "quote range"
- WHATSAPP_AUTO_REPLY_SAFETY_RULES.md:23 contains "rough estimate"
- WHATSAPP_AUTO_REPLY_SAFETY_RULES.md:24 contains "package price"
- WHATSAPP_EMERGENCY_OFF_GUIDE.md:43 contains "quote range"
- WHATSAPP_LIVE_TEST_SETUP_GUIDE.md:110 contains "quote range"
- WHATSAPP_LIVE_TEST_SETUP_GUIDE.md:23 contains "service_role"
- WHATSAPP_LIVE_TEST_SETUP_GUIDE.md:23 contains "SUPABASE_SERVICE_ROLE_KEY"
- node_modules is present in the working folder

## Go / No-Go Recommendation

NO-GO. Browser QA must complete before this can be treated as done.

## What Marcus Must Manually Verify

- Set SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD for a boss test user, then rerun authenticated browser QA.
- If live Supabase mode is used, verify all write tests use test-only records marked with the v4_2_browser_human_test timestamp.
- Before public production, keep /review-chatgpt-ui disabled by default and do not enable NEXT_PUBLIC_ENABLE_REVIEW_ROUTE.

## Recommended Next Phase

Fix the remaining browser QA failure and rerun v4.2 browser QA before moving forward.
