# v6.1 UI Polish + Test Lead Cleanup

Version: `v6_1_2_mission_control_ui_live_cleanup`

## v6.1.2 Add-On

v6.1.2 replaces the remaining brown/debug-style dashboard with a futuristic Mission Control cockpit. The main page now focuses on mission cards, the main action queue, recent WhatsApp leads, quick actions, and a compact system core.

- Main dashboard title is `LIMM Mission Control`.
- Main dashboard answers `What must Marcus do now?`.
- QA/system details remain in Settings and Reports.
- Leads page supports Active, Test, Archived/Deleted, Spam, and All filters.
- Active view hides test/generated leads by default.
- Settings cleanup has live dry-run counts, sample candidates, soft-delete default cleanup, Marcus/Fio protection proof, and a danger-zone action for already-soft-deleted test leads.
- Bulk in-app cleanup uses a normal confirmation modal instead of typed phrase entry.

## v6.1.1 Add-On

v6.1.1 keeps the v6.1 premium theme and tightens the live operating view:

- Main dashboard is decluttered into a boss-first sales view.
- System health, QA and diagnostic clutter are kept in Settings/Reports instead of the main dashboard.
- Lead inbox hides test leads by default and includes a `Show Test Leads` / `Hide Test Leads` filter.
- Settings page has a live in-app cleanup action guarded by confirmation text.
- Generated/test-looking lead titles are cleaned for display so the live UI does not show raw QA titles.
- Marcus/Fio protection remains absolute for CLI and in-app cleanup.

## What Changed Visually

v6.1 keeps the v6 Ultimate command centre structure, but improves the visual layer so it feels more like a premium internal sales cockpit:

- Cleaner near-black espresso background.
- Deeper coffee and bronze panels.
- Restrained premium gold highlights.
- Softer card shadows and clearer panel hierarchy.
- Bigger body text, bigger metric numbers, and more comfortable button tap targets.
- Dashboard now leads with `Today's Missions`, so Marcus sees the most important actions first.
- v6.1.1 removes the dense mission/debug sections from the dashboard and keeps it focused on immediate boss actions.
- Lead cards show clearer title, heat score, mission brief, readiness, WhatsApp preview, and quick navigation to open/pause/take over a lead.
- Lead detail surfaces next best action and conversation summary near the top.
- Settings are grouped into boss-friendly control cards.
- Reports include clearer QA/build reminders.

## Palette

- Background: `#120D08`
- Deep panel: `#1B120B`
- Dark bronze panel: `#24170D`
- Card: `#20150E`
- Elevated card: `#2A1B10`
- Premium gold: `#D6A84F`
- Soft gold hover: `#E8C76A`
- Antique gold: `#B88935`
- Main text: `#FFF7E6`
- Secondary text: `#D8C4A5`
- Muted text: `#A88F6A`

## Font / Readability Improvements

- Base body font is slightly larger at `15.5px`.
- Important card text has moved toward `text-base`.
- Metric values are larger.
- Buttons use larger minimum height and clearer visual states.
- Inputs and selects have larger click targets.

## Test Lead Cleanup Rules

Cleanup is intentionally conservative. It only acts on clearly identified old test/QA/demo seed data.

Hard protection rule:

- Any lead mentioning `Marcus` or `Fio` in the lead name, contact name, display name, phone label, CRM title, latest client message, or saved message content is excluded from cleanup completely.
- This protection wins even if the same lead also contains QA/test/demo markers.
- Marcus and Fio leads are never soft-deleted or hard-deleted by the cleanup script.

The script identifies a lead as test data only when it has strong evidence, such as:

- Client name clearly contains `test`, `qa`, `sample`, or `sandbox`.
- Metadata or messages contain v4/v5/v6 QA markers.
- Phone number is obviously fake/test-only.
- Lead is already marked `is_test`.
- Known QA phrases appear with enough supporting evidence.
- Known QA phrases include `laminated wall cladding test`.

Weak phrases such as `how much ah` alone are not enough to clean a lead because they can be real customer messages.

## In-App Cleanup

Settings includes a live cleanup action for Marcus/admin:

- Shows scanned lead count.
- Shows cleanup target count.
- Shows Marcus/Fio protected count.
- Shows skipped uncertain count.
- Requires typing `CLEAN TEST LEADS`.
- Soft-deletes test leads by default.
- Does not expose hard-delete bulk cleanup in the browser.

## Dry Run Usage

Dry run is the default and performs no writes:

```powershell
node scripts/cleanup_old_test_leads_v6_1.mjs
```

Report output:

```text
reports/V6_1_TEST_LEAD_CLEANUP_REPORT.md
```

Review the report before any apply run.

## Apply Usage

Apply mode requires an explicit flag:

```powershell
node scripts/cleanup_old_test_leads_v6_1.mjs --apply
```

Apply mode:

- Marks clearly identified test leads as `is_test`.
- Soft-deletes them by setting `deleted_at`, `deleted_by`, and `delete_reason`.
- Writes cleanup audit logs before cleanup writes.
- Does not hard delete by default.
- Skips Marcus/Fio-protected leads even in apply mode.

## Hard Delete Warning

Permanent deletion is not part of normal cleanup.

Hard delete requires:

- The lead is clearly test data.
- The lead was already soft-deleted.
- The explicit `--hard-delete-test-data` flag is passed.
- Audit is written before deletion.
- The lead does not mention Marcus or Fio anywhere in protected fields/message content.

Command:

```powershell
node scripts/cleanup_old_test_leads_v6_1.mjs --apply --hard-delete-test-data
```

Do not use this for real leads.

## Live Retest Checklist

1. Apply Supabase migration 019 if it is not already live.
2. Open `/api/whatsapp/health`.
3. Confirm `version: v6_1_2_mission_control_ui_live_cleanup`.
4. Open dashboard and confirm the premium theme/readability.
5. Open leads and confirm old inactive/test leads are hidden by default.
6. Run cleanup dry run.
7. Review `reports/V6_1_TEST_LEAD_CLEANUP_REPORT.md`.
8. Confirm Marcus/Fio protected leads are excluded from the cleanup list.
9. Apply cleanup only if every identified lead is truly test data.
10. Confirm real leads are untouched.
11. Confirm restore still works on a test lead.
12. Confirm hard delete remains boss/admin-only and requires prior soft delete.

## Rollback Plan

- If the UI is not preferred, revert the v6.1 UI commit and redeploy.
- If cleanup apply soft-deletes a test lead that should be visible, restore it from the lead detail page.
- Do not delete audit logs.
- Do not run hard delete unless Marcus has reviewed the dry-run report.
