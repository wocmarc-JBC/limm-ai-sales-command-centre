# v6.1.4 Mission Control UX Final Polish

Version: `v6_1_4_mission_control_ux_final_polish`

## What Changed

v6.1.4 is a UX and information architecture cleanup pass. It reduces dashboard clutter and makes the app feel more like a clean mission-control cockpit while keeping the live WhatsApp, Supabase, audit, cleanup, and safety systems intact.

The dashboard is now designed to answer in a few seconds:

1. What needs Marcus now?
2. Which leads are hot?
3. What is overdue or stuck?
4. What should be cleaned?
5. Is the system healthy?

## Dashboard Declutter Rule

The dashboard only shows boss-action information:

- command status
- Marcus Today
- six mission cards
- main action queue
- recent active WhatsApp leads
- quick actions
- compact system core

Removed from the dashboard:

- raw QA output
- raw debug data
- full health JSON
- fake client file modules
- generated test IDs
- all-leads dumps
- repeated status blocks

Deep QA and diagnostics live in Reports and Settings.

## Marcus Today

`Marcus Today` is the hero action panel. It shows top priority actions such as:

- appointment requests
- floor plan review
- follow-up due
- price question review
- hacking/approval risk
- bot paused
- test lead cleanup

If there is nothing urgent, it shows:

`All clear. No urgent action right now.`

## Sidebar Grouping

Sidebar navigation is grouped into:

- Command
- Sales
- Accounts
- Operations
- System

Unfinished modules are disabled/coming soon instead of pretending to be live. Client Files is visible as disabled until real storage exists.

## Top Command Bar

The dashboard now includes a top command/search bar:

- Search lead / phone / scope
- Clean Test Leads
- QA Centre
- Settings
- Focus Mode toggle

The search input is future-safe and does not trigger risky automation.

## Focus Mode

Focus Mode uses `/?focus=true`.

It keeps the dashboard focused on:

- Marcus Today
- mission cards
- main action queue

Secondary panels are hidden for a cleaner work surface.

## Cleaner Lead Cards

Lead cards now show:

- cleaned display name or masked phone
- what the client wants
- stage
- next action
- risk chips
- missing info chips
- last message snippet
- Open / Take Over / Pause Bot

They no longer show bulky summaries, internal readiness blocks, or debug-style field dumps.

## Client Files

Client Files is disabled until real storage exists.

The live UI does not show:

- Daniel Tan mock folders
- Apex Clinic mock folders
- mock upload links
- placeholder upload actions
- fake client file data

Clients can still send floor plans, drawings, and site photos through WhatsApp.

## Cleanup Location

Live cleanup remains accessible from:

- Dashboard Quick Actions
- Settings -> Live Test Lead Cleanup
- Sidebar Operations -> Cleanup

Default cleanup is soft delete. Danger Zone hard delete only applies to already-soft-deleted test leads.

Protected names:

- Marcus
- Fio
- Fion

## Colour Hierarchy

- Gold: boss priority / hot lead
- Cyan: system / automation
- Amber: follow-up / warning
- Red: urgent / danger
- Green: healthy / complete
- Slate: disabled / archived / test

## Non-GST Reminder

LIMM Works is treated as non-GST registered in this app phase.

Do not show:

- GST fields
- GST calculations
- Tax Invoice wording
- GST invoice wording

## Price Guide On Hold

Price guide automation remains on hold.

Do not add:

- rough pricing
- amount ranges
- quote automation
- price guide import

## Live Retest

After deploy, confirm:

- `/api/whatsapp/health` shows `version: v6_1_4_mission_control_ux_final_polish`
- dashboard shows Mission Control
- Marcus Today exists
- sidebar is grouped
- top command bar exists
- Focus Mode works
- no fake Client Files data appears
- test leads are hidden by default
- cleanup remains accessible
- WhatsApp still replies

## Rollback

If anything looks wrong:

1. Stop using cleanup actions.
2. Set `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false` if WhatsApp replies need to pause.
3. Restore the previous Vercel deployment or revert the latest commit.
4. Soft-deleted leads can be restored from lead detail where available.

