# Next Steps For ChatGPT

## Review First

1. Review `docs/V6_1_6_MISSION_CONTROL_UI_INTEGRATED.md`.
2. Review `docs/V6_1_5_PERFORMANCE_FOLLOWUP_TEST_CLEANUP.md`.
3. Review `docs/V6_1_4_MISSION_CONTROL_UX_FINAL_POLISH.md`.
4. Review `reports/V6_1_TEST_LEAD_CLEANUP_REPORT.md` after Marcus runs cleanup dry-run.
5. Confirm `/api/whatsapp/health` shows `version: v6_1_6_mission_control_ui_integrated` before judging the deployed UI.
1. Review `docs/V6_ULTIMATE_BLUEPRINT.md`.
2. Review `docs/V6_ULTIMATE_SALES_COMMAND_CENTRE.md`.
3. Review `reports/V6_ULTIMATE_DEEP_QA_REPORT.md`.
4. Review `docs/V6_HUMAN_LIKE_SALES_BRAIN.md`.
5. Review `reports/V6_HUMAN_LIKE_SALES_BRAIN_DEEP_QA_REPORT.md`.

## Recommended Next Prompt For Marcus PowerShell

Prepare the controlled live v6.1.6 Mission Control UI integration retest:

- Keep all v4/v5 safety rules unchanged.
- Confirm health endpoint first; local PASS is not production PASS.
- v6.1 adds premium UI/readability polish and safe dry-run-first old test lead cleanup.
- v6.1.4 final-polishes Mission Control with Marcus Today, grouped sidebar navigation, top command bar, Focus Mode, simplified lead cards, disabled Client Files until real storage, and no fake client-file data.
- v6.1.5 limits the Follow-Up Queue, fixes action button responsiveness, hides test follow-ups by default, and adds in-app cleanup for both test leads and test follow-ups.
- v6.1.6 integrates the Jules cockpit UI direction directly in repo, keeps Client Files Coming Soon only, and shows full phone numbers in protected lead cards.
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
node scripts/test_v6_1_4_mission_control_ux_final_polish.mjs
node scripts/test_v6_1_5_performance_followup_test_cleanup.mjs
node scripts/test_v6_1_6_mission_control_ui_integrated.mjs
node scripts/cleanup_old_test_leads_v6_1.mjs
node scripts/audit_v3_package.mjs
```

## What Codex Should Build Next

- The next phase should only happen after Marcus confirms v6 deployed health and live retest results.
- Recommended next scope: confirm v6.1.6 health, visually verify dashboard/sidebar/lead cards/Client Files, then review Settings cleanup counts only if Marcus is ready to clean test data.
- Optional OpenAI/AI WhatsApp reply testing should remain disabled until v6 deterministic local brain is proven live.

## Avoid

- Do not enable OpenAI WhatsApp reply by default.
- Do not enable autonomous Calendar booking.
- Do not send project photos automatically.
- Do not invent Instagram handles or fake past project photos.
- Do not auto-generate pricing or amount ranges.
- Do not add WhatsApp blasting or broadcast.
- Do not live test before deployed health proves v6 Ultimate.
