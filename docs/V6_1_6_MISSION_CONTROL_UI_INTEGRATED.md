# v6.1.6 Mission Control UI Integrated

Version: `v6_1_6_mission_control_ui_integrated`

## Why This Patch Exists

Jules produced useful UI direction, but no branch or PR reached the repository. This patch integrates the same Jules UI ideas and Mission Control UI ideas directly on top of v6.1.5 without rebuilding the backend or disturbing the working WhatsApp/Supabase pipeline.

## What Changed

- Preserved the v6.1.5 follow-up performance, cleanup, and pending-button work.
- Added explicit v6.1.6 health proof fields.
- Added a cockpit-grid overlay to the dashboard hero area.
- Preserved the dark glassmorphism Mission Control aesthetic with champagne/gold priority accents, cyan automation accents, green healthy states, and red danger-only states.
- Preserved grouped sidebar navigation for Command, Sales, Accounts, Operations, and System.
- Kept the dashboard focused on `What must Marcus do now?`
- Kept `Marcus Today`, `Main Action Queue`, `Recent WhatsApp Leads`, `Quick Actions`, and compact `System Core`.
- Lead cards now show the full phone number in protected app views.
- Client Files remains a Coming Soon disabled state only.

## v6.1.5 Follow-Up Performance Preserved

The Follow-Up Queue still keeps:

- Page size 20.
- Active real rows by default.
- Test follow-ups hidden by default.
- Completed follow-ups hidden by default.
- Active / Due Today / Overdue / Snoozed / Completed / Show All filters.
- Search and Load More.
- Complete / Snooze / No Reply buttons with pending states.

## Cleanup Preserved

The in-app cleanup still covers:

- Test leads.
- Test follow-ups.
- Soft-delete/hide default behavior.
- Explicit Danger Zone only for already-soft-deleted test leads.
- Marcus/Fio/Fion hard protection.
- Scan only when Marcus clicks `Scan Test Data`.

## Client Files Policy

Client Files does not show fake folders, mock clients, Daniel Tan, Apex Clinic, mock upload links, or fake storage states.

Until real Supabase Storage/client upload handling is implemented, it remains a simple Coming Soon page.

## Safety Status

- WhatsApp webhook untouched.
- Supabase schema/migrations untouched.
- Auth untouched.
- Delete/hard-delete logic untouched.
- Price guide remains on hold.
- Calendar auto-booking remains off.
- Voice transcription remains disabled.
- LIMM Works is not GST registered.
- No GST calculation or Tax Invoice wording added.
- No secrets or env values included.

## Live Retest

After deploy, check:

1. `/api/whatsapp/health` shows `version: v6_1_6_mission_control_ui_integrated`.
2. Dashboard has the cockpit/Mission Control feel.
3. Marcus Today appears first.
4. Sidebar is grouped.
5. Lead cards show full phone numbers inside the protected app.
6. Client Files says Coming Soon only.
7. Follow-Up Queue remains fast and paginated.
8. Follow-Up buttons still work.
9. Test leads and test follow-ups remain hidden by default.
10. WhatsApp bot still replies.

## Rollback

If a UI issue appears after deploy, revert the v6.1.6 commit only. No database migration or env change is required for this patch.
