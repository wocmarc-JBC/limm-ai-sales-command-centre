# v6.1.2 Mission Control UI + Live Cleanup

Version: `v6_1_2_mission_control_ui_live_cleanup`

## What Changed

v6.1.2 turns the home dashboard into a compact Mission Control cockpit focused on one question: what must Marcus do now?

The previous dashboard still felt too wide, too brown, and too much like a developer debug board. This version moves deep QA/system information to Settings and Reports, while the main dashboard keeps only priority mission cards, the main action queue, recent WhatsApp leads, quick actions, and a compact system core.

## Mission Control Structure

- Header: `LIMM Mission Control`
- Priority line: today’s command priority
- Mission cards: Needs Marcus, Hot Leads, Appointment Requests, Floor Plans Received, Follow-Up Due, Bot Paused
- Main Action Queue: high-priority leads and next best moves
- Recent WhatsApp Leads: readable client cards
- Quick Actions: Clean Test Leads, Reports, Settings, Audit Log
- System Core: WhatsApp, Supabase, Bot, Email Handoff

## Visual Direction

The UI uses a dark cockpit palette with champagne gold and cyan system accents:

- Deep space black: `#05070A`
- Cockpit black: `#090D12`
- Dark navy panel: `#101820`
- Champagne gold: `#D6A84F`
- Command gold: `#F5C542`
- Radar cyan: `#22D3EE`
- System blue: `#38BDF8`

Panels use glass-style borders, subtle glow, and a radar/grid background. Main content is capped around 1440px so it does not stretch awkwardly on large monitors.

## Lead Display Name Cleaner

Generated lead titles such as QA markers, UUIDs, browser test names, versioned test names, and raw WhatsApp placeholders are cleaned before display.

Rules:

- Marcus and Fio names are always preserved.
- Test leads show as `Test Lead`.
- Unknown WhatsApp leads show a masked phone label if possible.
- Raw generated/test IDs are not shown as client names.

## Live Cleanup Flow

Settings now includes `Delete / Cleanup -> Live Test Lead Cleanup`.

The panel performs a live server-side dry run and shows:

- leads scanned
- test leads found
- Marcus/Fio protected
- uncertain leads skipped
- already-soft-deleted test leads
- a sample list of cleanup candidates

Default action:

- `Soft Delete Test Leads`
- marks clear QA/test leads as test data
- soft-deletes them from active dashboard/inbox
- skips uncertain real-looking leads
- protects Marcus/Fio completely

Danger Zone:

- `Permanently Delete Soft-Deleted Test Leads`
- only affects already-soft-deleted test leads
- never hard-deletes Marcus or Fio
- audit must succeed before deletion
- not the default cleanup path

## Test Lead Hiding

Active dashboard and lead inbox hide:

- soft-deleted leads
- archived leads
- spam leads
- marked test leads
- obvious generated QA/test leads

The Leads page includes filters:

- Active Leads
- Show Test Leads
- Archived / Deleted
- Show Spam
- Show All

## Specific Works Brain

v6.1.2 adds a small anti-generic reply improvement for specific renovation items such as:

- laminated wall cladding
- wall cladding
- fluted panel
- feature wall
- toilet overlay
- false ceiling
- vinyl/SPC flooring
- wardrobe
- kitchen cabinet
- backsplash
- commercial office renovation
- waterproofing
- hacking 2 walls

The bot should mention the specific item where safe, while still avoiding pricing, false certainty, and appointment confirmation.

## Safety Rules

- WhatsApp webhook and known-good payload are unchanged.
- Price guide automation remains on hold.
- Calendar auto-booking remains off.
- Voice transcription remains disabled.
- Soft delete is the default cleanup action.
- Hard delete is not default and only applies to already-soft-deleted test data.
- Marcus and Fio are always protected from cleanup.
- Audit logs remain required.

## Live Retest

After Vercel deploys, open:

`https://limm-ai-sales-command-centre.vercel.app/api/whatsapp/health`

Expected:

- `version: v6_1_2_mission_control_ui_live_cleanup`
- `missionControlUiAvailable: true`
- `futuristicCockpitThemeAvailable: true`
- `dashboardDeclutterAvailable: true`
- `leadDisplayNameCleanerAvailable: true`
- `liveTestLeadCleanupAvailable: true`
- `inAppCleanupDryRunAvailable: true`
- `marcusFioCleanupProtectionAvailable: true`
- `hideTestLeadsFromDashboardAvailable: true`
- `priceGuideOnHold: true`

Then:

1. Open dashboard.
2. Confirm it looks like Mission Control, not a brown debug board.
3. Confirm fonts are readable.
4. Confirm raw/generated lead names are cleaned.
5. Confirm test leads are hidden from active dashboard.
6. Open Settings -> Live Test Lead Cleanup.
7. Review dry-run counts.
8. Confirm Marcus/Fio protected count.
9. Soft-delete test leads if counts look right.
10. Confirm real leads remain.
11. Send a WhatsApp test message and confirm auto-reply still works.

## Rollback

If the deploy behaves incorrectly:

1. Stop using the cleanup panel.
2. Set `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false` if WhatsApp replies need to pause.
3. Redeploy the previous Vercel deployment or revert the latest commit.
4. Restore any mistakenly soft-deleted lead from the lead detail page.

