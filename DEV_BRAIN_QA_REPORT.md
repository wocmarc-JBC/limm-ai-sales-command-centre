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
- WhatsApp: auto-reply disabled by default
- Calendar: disabled by default

## Routes Tested

- / (desktop-chromium)
- /login (desktop-chromium)
- /leads (desktop-chromium)
- /leads/lead-001 (desktop-chromium)
- /appointments (desktop-chromium)
- /appointment-settings (desktop-chromium)
- /approvals (desktop-chromium)
- /followups (desktop-chromium)
- /quotation-readiness (desktop-chromium)
- /client-files (desktop-chromium)
- /reports (desktop-chromium)
- /settings (desktop-chromium)
- /audit-log (desktop-chromium)
- /review-chatgpt-ui (desktop-chromium)
- / (mobile-chromium)
- /login (mobile-chromium)
- /leads (mobile-chromium)
- /leads/lead-001 (mobile-chromium)
- /appointments (mobile-chromium)
- /appointment-settings (mobile-chromium)
- /approvals (mobile-chromium)
- /followups (mobile-chromium)
- /quotation-readiness (mobile-chromium)
- /client-files (mobile-chromium)
- /reports (mobile-chromium)
- /settings (mobile-chromium)
- /audit-log (mobile-chromium)
- /review-chatgpt-ui (mobile-chromium)
- / (tablet-chromium)
- /login (tablet-chromium)
- /leads (tablet-chromium)
- /leads/lead-001 (tablet-chromium)
- /appointments (tablet-chromium)
- /appointment-settings (tablet-chromium)
- /approvals (tablet-chromium)
- /followups (tablet-chromium)
- /quotation-readiness (tablet-chromium)
- /client-files (tablet-chromium)
- /reports (tablet-chromium)
- /settings (tablet-chromium)
- /audit-log (tablet-chromium)
- /review-chatgpt-ui (tablet-chromium)

## Browser QA Completed

Yes.
Report: V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md

## Auth Tested

No. Authenticated browser/write testing is MANUAL REQUIRED until SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are set.

## Buttons Tested / Verified

- Sign In

## Functions Tested

- SKIP: live Supabase schema verifier - Live network may be blocked in this runner.
- MANUAL REQUIRED: authenticated live actions verifier - Set SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD for a test boss user.
- PASS: Playwright browser QA
- PASS: generate Dev Brain report
- PASS: generate ChatGPT handoff report
- SKIP: cleanup generated artifacts before package audit - exit 1
- PASS: scripts/doctor.mjs
- FAIL: scripts/test_v3_foundation.mjs - exit 1
- FAIL: scripts/test_v3_supabase_layer.mjs - exit 1
- FAIL: scripts/test_v3_auth_rls_static.mjs - exit 1
- FAIL: scripts/test_v3_live_setup_static.mjs - exit 1
- PASS: scripts/test_v3_review_route_static.mjs
- FAIL: scripts/test_v4_launch_candidate.mjs - exit 1
- PASS: scripts/test_v4_1_dev_brain_static.mjs
- PASS: scripts/test_v4_6_openai_dry_run.mjs
- PASS: scripts/test_v4_7_openai_boss_review_ux.mjs
- PASS: scripts/test_v4_8_whatsapp_closed_test.mjs
- PASS: scripts/test_v4_8_live_diagnostics_static.mjs
- PASS: scripts/test_whatsapp_adapter_payload_shape.mjs
- PASS: scripts/test_v4_9_deployment_readiness.mjs
- PASS: scripts/test_v5_whatsapp_sales_brain_calendar.mjs
- PASS: scripts/test_v5_2_whatsapp_question_bank.mjs
- PASS: scripts/test_v5_3_whatsapp_reply_coach_replay.mjs
- PASS: scripts/test_v5_3_1_multi_intent_lead_context_portfolio.mjs
- PASS: scripts/test_v5_3_2_deep_whatsapp_agent_qa.mjs
- PASS: scripts/test_v6_human_like_sales_brain_deep_qa.mjs
- PASS: scripts/test_v6_ultimate_deep_qa.mjs
- PASS: scripts/test_v6_1_ui_polish_cleanup.mjs
- PASS: scripts/test_v6_1_2_mission_control_ui_cleanup.mjs
- PASS: scripts/test_v6_1_4_mission_control_ux_final_polish.mjs
- PASS: scripts/test_v6_1_5_performance_followup_test_cleanup.mjs
- PASS: scripts/test_v6_1_6_mission_control_ui_integrated.mjs
- PASS: scripts/test_v6_1_7_mission_control_ui_refinement.mjs
- PASS: scripts/test_v6_1_8_dashboard_compression_zero_state_polish.mjs
- PASS: scripts/test_v6_3_sales_collection_command_centre.mjs
- FAIL: package audit - exit 1

## Parameters Tested

- Appointment days including Sunday configurable behavior.
- Appointment type controls.
- Minimum notice, max-per-day, buffer, same-day rule, public holiday rule, and boss approval rule coverage through static/Playwright-ready checks.
- Quotation readiness score, missing info, boss review flag, and checklist safety.
- Approval gate matrix for price, timeline, authority, landed, commercial, structural, complaint, discount, special timing, risky visit, and high-value rejection.

## Forms Tested / Verified

- Email | Password | Sign In

## Screenshots Captured

- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-route-dashboard.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-route-login.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-route-leads.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-route-leads-lead-001.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-route-appointments.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-route-appointment-settings.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-route-approvals.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-route-followups.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-route-quotation-readiness.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-route-client-files.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-route-reports.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-route-settings.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-route-audit-log.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-route-review-chatgpt-ui.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-review-route-disabled.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\desktop-chromium-login.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-route-dashboard.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-route-login.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-route-leads.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-route-leads-lead-001.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-route-appointments.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-route-appointment-settings.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-route-approvals.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-route-followups.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-route-quotation-readiness.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-route-client-files.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-route-reports.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-route-settings.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-route-audit-log.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-route-review-chatgpt-ui.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-review-route-disabled.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\mobile-chromium-login.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-route-dashboard.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-route-login.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-route-leads.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-route-leads-lead-001.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-route-appointments.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-route-appointment-settings.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-route-approvals.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-route-followups.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-route-quotation-readiness.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-route-client-files.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-route-reports.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-route-settings.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-route-audit-log.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-route-review-chatgpt-ui.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-review-route-disabled.png
- screenshots\v4_2_browser_human_test_2026-06-01T10-12-06-874Z\tablet-chromium-login.png

## Traces Captured

- No failure traces captured or copied.

## Bugs Found

- None.

## Bugs Fixed

- None.

## Bugs Remaining

- None.

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
- PASS: Playwright browser QA
- PASS: generate Dev Brain report
- PASS: generate ChatGPT handoff report
- SKIP: cleanup generated artifacts before package audit
- PASS: scripts/doctor.mjs
- FAIL: scripts/test_v3_foundation.mjs
- FAIL: scripts/test_v3_supabase_layer.mjs
- FAIL: scripts/test_v3_auth_rls_static.mjs
- FAIL: scripts/test_v3_live_setup_static.mjs
- PASS: scripts/test_v3_review_route_static.mjs
- FAIL: scripts/test_v4_launch_candidate.mjs
- PASS: scripts/test_v4_1_dev_brain_static.mjs
- PASS: scripts/test_v4_6_openai_dry_run.mjs
- PASS: scripts/test_v4_7_openai_boss_review_ux.mjs
- PASS: scripts/test_v4_8_whatsapp_closed_test.mjs
- PASS: scripts/test_v4_8_live_diagnostics_static.mjs
- PASS: scripts/test_whatsapp_adapter_payload_shape.mjs
- PASS: scripts/test_v4_9_deployment_readiness.mjs
- PASS: scripts/test_v5_whatsapp_sales_brain_calendar.mjs
- PASS: scripts/test_v5_2_whatsapp_question_bank.mjs
- PASS: scripts/test_v5_3_whatsapp_reply_coach_replay.mjs
- PASS: scripts/test_v5_3_1_multi_intent_lead_context_portfolio.mjs
- PASS: scripts/test_v5_3_2_deep_whatsapp_agent_qa.mjs
- PASS: scripts/test_v6_human_like_sales_brain_deep_qa.mjs
- PASS: scripts/test_v6_ultimate_deep_qa.mjs
- PASS: scripts/test_v6_1_ui_polish_cleanup.mjs
- PASS: scripts/test_v6_1_2_mission_control_ui_cleanup.mjs
- PASS: scripts/test_v6_1_4_mission_control_ux_final_polish.mjs
- PASS: scripts/test_v6_1_5_performance_followup_test_cleanup.mjs
- PASS: scripts/test_v6_1_6_mission_control_ui_integrated.mjs
- PASS: scripts/test_v6_1_7_mission_control_ui_refinement.mjs
- PASS: scripts/test_v6_1_8_dashboard_compression_zero_state_polish.mjs
- PASS: scripts/test_v6_3_sales_collection_command_centre.mjs
- FAIL: package audit

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
