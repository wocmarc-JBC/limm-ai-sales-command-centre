# Next Steps For ChatGPT

## Review First

1. Review `docs/V6_4_10_SINGAPORE_MAP_INTERACTION_COPY_CLEANUP.md`.
2. Review `docs/V6_4_9_SINGAPORE_MAP_SMOOTH_ZOOM_WHEEL_LOCK.md`.
3. Review `docs/V6_4_8_SINGAPORE_MAP_INTERACTION_FINAL_POLISH.md`.
4. Review `docs/V6_4_6_OFFICIAL_URA_NO_SEA_MAP_SOURCE.md`.
5. Review `docs/V6_4_5_REAL_SINGAPORE_GEOJSON_MAP.md`.
6. Review `docs/V6_5_1_ACCURATE_SINGAPORE_MAP_REFINEMENT.md`.
7. Review `docs/V6_5_SMART_LEAD_INTAKE_MEETING_PREP.md`.
8. Review `docs/V6_4_4_ACCURATE_SINGAPORE_SVG_MAP_FIX.md`.
9. Review `docs/V6_4_3_SINGAPORE_MAP_ZOOM_HQ_REDESIGN.md`.
10. Review `docs/V6_4_2_ACCURATE_SINGAPORE_MAP_NO_OVERLAY.md`.
11. Review `docs/V6_4_1_SINGAPORE_TACTICAL_MAP_UI_POLISH.md`.
12. Review `docs/V6_4_SINGAPORE_MISSION_MAP.md`.
13. Confirm `/api/whatsapp/health` shows the deployed map version before judging the deployed UI.
1. Review `docs/V6_ULTIMATE_BLUEPRINT.md`.
2. Review `docs/V6_ULTIMATE_SALES_COMMAND_CENTRE.md`.
3. Review `reports/V6_ULTIMATE_DEEP_QA_REPORT.md`.
4. Review `docs/V6_HUMAN_LIKE_SALES_BRAIN.md`.
5. Review `reports/V6_HUMAN_LIKE_SALES_BRAIN_DEEP_QA_REPORT.md`.

## Recommended Next Prompt For Marcus PowerShell

Prepare the controlled live v6.4.10 Singapore Mission Map Interaction + Copy Cleanup retest:

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
- v6.4.4 replaces the weak blob-like island path with a dedicated local Singapore SVG component, keeps only the mainland plus one small Sentosa, and positions LIMM HQ on the central main island.
- v6.4.5 replaces the hand-drawn static outline with a local real Singapore GeoJSON asset, renders it into SVG, keeps HQ at postal 228397 around Orchard / Dhoby Ghaut, and keeps Sentosa small and island-shaped.
- v6.4.6 commits the official URA/data.gov.sg Master Plan 2019 Planning Area Boundary (No Sea) geometry after Marcus ran the downloader locally.
- v6.4.8 fixes the Singapore Mission Map reset/zoom interaction layer, tightens default fit, adds selected area/pin/HQ summaries, keeps filters meaningful, and preserves the official geometry.
- v6.4.9 smooths `+` / `-` zoom, adds a non-passive wheel zoom lock so the page does not scroll while zooming the map, increases max zoom to 400%, and optimizes the map fill without cropping.
- v6.4.10 keeps default zoom at 100%, dedupes the top-left map copy, moves helper text below the map, polishes filter empty states, adds pin/HQ inspector feedback, and keeps the official geometry intact.
- v6.5 adds a Smart Lead Intake profile, missing-info detector, 3-5 question cap, lifestyle/occupants/helper/pets/safety fields, budget expectation collection without price replies, timeline/key/move-in collection, Meeting Readiness score, Proposal Readiness score, and lead intake audit trace.
- v6.5.1 replaces the previous weak mainland path with a more accurate local static Singapore outline, recalibrates HQ around Orchard/Dhoby Ghaut, makes Sentosa smaller and more island-shaped, removes the large map helper box, and adds faint area labels.
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
node scripts/test_v6_4_4_accurate_singapore_svg_map_fix.mjs
node scripts/test_v6_4_5_real_singapore_geojson_map.mjs
node scripts/test_v6_4_6_official_singapore_planning_area_map.mjs
node scripts/test_v6_4_8_singapore_map_interaction_final_polish.mjs
node scripts/test_v6_4_9_singapore_map_smooth_zoom_wheel_lock.mjs
node scripts/test_v6_4_10_singapore_map_interaction_copy_cleanup.mjs
node scripts/test_v6_5_smart_lead_intake_meeting_prep.mjs
node scripts/test_v6_5_1_accurate_singapore_map_refinement.mjs
node scripts/cleanup_old_test_leads_v6_1.mjs
node scripts/audit_v3_package.mjs
```

## What Codex Should Build Next

- The next phase should only happen after Marcus confirms v6 deployed health and live retest results.
- Recommended next scope: confirm v6.4.10 health, visually verify the map starts at 100%, top-left copy is not double-stacked, helper text is subtle, wheel zoom over the map does not scroll the page, `+` / `-` zoom feels smooth, Reset returns to a perfect fitted Singapore view, panning clears on reset, HQ and pins stay aligned, filters show one subtle empty state, and no external map API appears.
- Optional OpenAI/AI WhatsApp reply testing should remain disabled until v6 deterministic local brain is proven live.

## Avoid

- Do not enable OpenAI WhatsApp reply by default.
- Do not enable autonomous Calendar booking.
- Do not send project photos automatically.
- Do not invent Instagram handles or fake past project photos.
- Do not auto-generate pricing or amount ranges.
- Do not add WhatsApp blasting or broadcast.
- Do not live test before deployed health proves v6 Ultimate.
# v6.7 Next Step

Review `docs/V6_7_REAL_CLIENT_FILE_UPLOAD_WHATSAPP_MEDIA_STORAGE.md`.

After push/deploy:

1. Apply `supabase/migrations/023_v6_7_real_client_file_upload.sql`.
2. Confirm Supabase Storage bucket `client-files` exists and is private.
3. Confirm `/api/whatsapp/health` shows `v6_7_real_client_file_upload_whatsapp_media_storage`.
4. Open a protected lead and create an upload link.
5. Upload a PDF floor plan and site photos through `/upload/{token}`.
6. Confirm lead detail and `/client-files` show real file status.
7. Confirm signed view/download works.
8. Mark one test file reviewed.
9. Void one test file with a reason.
10. Send a WhatsApp image/document as the client and confirm it stores privately and links to the lead.
11. Confirm WhatsApp text auto-reply still sends.

Do not enable pricing automation, Calendar auto-booking, voice transcription, public file buckets, or hard-delete file actions.
