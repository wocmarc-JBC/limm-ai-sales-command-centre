# Next Steps For ChatGPT

## Review First

1. Review `docs/V6_4_3_SINGAPORE_MAP_ZOOM_HQ_REDESIGN.md`.
2. Review `docs/V6_4_2_ACCURATE_SINGAPORE_MAP_NO_OVERLAY.md`.
3. Review `docs/V6_4_1_SINGAPORE_TACTICAL_MAP_UI_POLISH.md`.
4. Review `docs/V6_4_SINGAPORE_MISSION_MAP.md`.
5. Review `docs/V6_3_SALES_COLLECTION_COMMAND_CENTRE.md`.
6. Confirm `/api/whatsapp/health` shows `version: v6_4_3_singapore_map_zoom_hq_redesign` before judging the deployed UI.
1. Review `docs/V6_ULTIMATE_BLUEPRINT.md`.
2. Review `docs/V6_ULTIMATE_SALES_COMMAND_CENTRE.md`.
3. Review `reports/V6_ULTIMATE_DEEP_QA_REPORT.md`.
4. Review `docs/V6_HUMAN_LIKE_SALES_BRAIN.md`.
5. Review `reports/V6_HUMAN_LIKE_SALES_BRAIN_DEEP_QA_REPORT.md`.

## Recommended Next Prompt For Marcus PowerShell

Prepare the controlled live v6.4.3 Singapore Map Zoom + HQ retest:

- Keep all v4/v5 safety rules unchanged.
- Confirm health endpoint first; local PASS is not production PASS.
- v6.1 adds premium UI/readability polish and safe dry-run-first old test lead cleanup.
- v6.1.4 final-polishes Mission Control with Marcus Today, grouped sidebar navigation, top command bar, Focus Mode, simplified lead cards, disabled Client Files until real storage, and no fake client-file data.
- v6.1.5 limits the Follow-Up Queue, fixes action button responsiveness, hides test follow-ups by default, and adds in-app cleanup for both test leads and test follow-ups.
- v6.1.6 integrates the Jules cockpit UI direction directly in repo, keeps Client Files Coming Soon only, and shows full phone numbers in protected lead cards.
- v6.1.7 refines Marcus Today, Focus Mode, lead cards, Lead Heat Meter, sticky command bar, compact System Core, empty states, and the lead detail Command Timeline without touching backend/write paths.
- v6.1.8 keeps the grand radar, makes it useful with operational counts/legend/action, makes the sidebar scrollable, and compresses zero-state dashboard clutter.
- v6.3 adds manual Sales Pipeline, Sales & Collection, Targets, Boss Monthly Report, manual quotation tracking, outstanding/overdue collection tracking, and payment void-not-delete safety.
- v6.4 adds a privacy-safe Singapore Mission Map with local area/postal parsing, hybrid area heatmap, clickable pins, unknown-area count, and sales/collection map layers where data exists.
- v6.4.1 replaces the generic oval/radar visual with a stylised Singapore silhouette, compact premium empty state, integrated legend, and area summary panel.
- v6.4.2 upgrades the map base to a more accurate Singapore outline and removes the blocking empty-state overlay so the map remains visible even with no data.
- v6.4.3 widens the map, adds zoom/pan/reset controls, keeps only the main island plus Sentosa, adds a privacy-safe LIMM HQ marker at postal `228397`, and fixes gold/amber visual separation.
- v6 Ultimate adds human-like reply planning, Context Truth Gate, Singapore renovation shorthand understanding, Safety Governor, Reply Quality Judge, cleanup controls, human takeover, bot pause/resume, mission queue, lead scoring, gold UI, settings/QA centre, and 200+ case QA.
- OpenAI WhatsApp reply remains off.
- Optional AI v6 interpreter/drafter flags remain off by default.
- Calendar auto-booking remains off.
- LIMM Works Pte Ltd is not GST-registered. No GST charged.
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
node scripts/test_v6_1_7_mission_control_ui_refinement.mjs
node scripts/test_v6_1_8_dashboard_compression_zero_state_polish.mjs
node scripts/test_v6_3_sales_collection_command_centre.mjs
node scripts/test_v6_4_singapore_mission_map.mjs
node scripts/test_v6_4_1_singapore_tactical_map_ui_polish.mjs
node scripts/test_v6_4_2_accurate_singapore_map_no_overlay.mjs
node scripts/test_v6_4_3_singapore_map_zoom_hq_redesign.mjs
node scripts/cleanup_old_test_leads_v6_1.mjs
node scripts/audit_v3_package.mjs
```

## What Codex Should Build Next

- The next phase should only happen after Marcus confirms v6 deployed health and live retest results.
- Recommended next scope: confirm v6.4.3 health, visually verify the wider zoomable Singapore map, pan/reset controls, LIMM HQ marker, Sentosa-only base, brighter gold/amber separation, no blocking overlay, privacy behavior, Sales Pipeline, Sales & Collection, Targets, Boss Monthly Report, manual Quotation Readiness status, and existing Mission Control dashboard, then review Settings cleanup counts only if Marcus is ready to clean test data.
- Optional OpenAI/AI WhatsApp reply testing should remain disabled until v6 deterministic local brain is proven live.

## Avoid

- Do not enable OpenAI WhatsApp reply by default.
- Do not enable autonomous Calendar booking.
- Do not send project photos automatically.
- Do not invent Instagram handles or fake past project photos.
- Do not auto-generate pricing or amount ranges.
- Do not add WhatsApp blasting or broadcast.
- Do not live test before deployed health proves v6 Ultimate.
