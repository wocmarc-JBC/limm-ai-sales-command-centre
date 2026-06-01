# Next Steps For ChatGPT

## Review First

1. Review `docs/V6_1_2_MISSION_CONTROL_UI_LIVE_CLEANUP.md`.
2. Review `docs/V6_1_UI_POLISH_TEST_CLEANUP.md`.
3. Review `reports/V6_1_TEST_LEAD_CLEANUP_REPORT.md` after Marcus runs the dry-run cleanup.
3. Confirm `/api/whatsapp/health` shows `version: v6_1_2_mission_control_ui_live_cleanup` before judging the deployed UI.
1. Review `docs/V6_ULTIMATE_BLUEPRINT.md`.
2. Review `docs/V6_ULTIMATE_SALES_COMMAND_CENTRE.md`.
3. Review `reports/V6_ULTIMATE_DEEP_QA_REPORT.md`.
4. Review `docs/V6_HUMAN_LIKE_SALES_BRAIN.md`.
5. Review `reports/V6_HUMAN_LIKE_SALES_BRAIN_DEEP_QA_REPORT.md`.

## Recommended Next Prompt For Marcus PowerShell

Prepare the controlled live v6.1.2 Mission Control dashboard + cleanup retest:

- Keep all v4/v5 safety rules unchanged.
- Confirm health endpoint first; local PASS is not production PASS.
- v6.1 adds premium UI/readability polish and safe dry-run-first old test lead cleanup.
- v6.1.2 redesigns the dashboard as Mission Control, hides test/QA leads by default, adds Active/Test/Archived/Spam/All filters, adds live in-app dry-run cleanup, removes typed cleanup phrase friction, and cleans generated lead display names.
- v6 Ultimate adds human-like reply planning, Context Truth Gate, Singapore renovation shorthand understanding, Safety Governor, Reply Quality Judge, cleanup controls, human takeover, bot pause/resume, mission queue, lead scoring, gold UI, settings/QA centre, and 200+ case QA.
- OpenAI WhatsApp reply remains off.
- Optional AI v6 interpreter/drafter flags remain off by default.
- Calendar auto-booking remains off.
- No pricing, amount ranges, package prices, or booking confirmation before a real event exists.
- Do not send project photos automatically.
- Test the v6 live sequence and inspect CRM audit logs for the expanded black box reply trace.

## Marcus PowerShell Commands

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm.cmd run build
node scripts/test_v5_3_whatsapp_reply_coach_replay.mjs
node scripts/test_v5_3_1_multi_intent_lead_context_portfolio.mjs
node scripts/test_v5_3_2_deep_whatsapp_agent_qa.mjs
node scripts/test_v6_human_like_sales_brain_deep_qa.mjs
node scripts/test_v6_ultimate_deep_qa.mjs
node scripts/test_v6_1_ui_polish_cleanup.mjs
node scripts/test_v6_1_2_mission_control_ui_cleanup.mjs
node scripts/cleanup_old_test_leads_v6_1.mjs
node scripts/audit_v3_package.mjs
```

## What Codex Should Build Next

- The next phase should only happen after Marcus confirms v6 deployed health and live retest results.
- Recommended next scope: apply migration 019 in live Supabase if needed, confirm v6.1.2 health, review Settings cleanup counts, then use the in-app soft-delete cleanup only if every identified lead is clearly test data and Marcus/Fio are protected.
- Optional OpenAI/AI WhatsApp reply testing should remain disabled until v6 deterministic local brain is proven live.

## Avoid

- Do not enable OpenAI WhatsApp reply by default.
- Do not enable autonomous Calendar booking.
- Do not send project photos automatically.
- Do not invent Instagram handles or fake past project photos.
- Do not auto-generate pricing or amount ranges.
- Do not add WhatsApp blasting or broadcast.
- Do not live test before deployed health proves v6 Ultimate.
