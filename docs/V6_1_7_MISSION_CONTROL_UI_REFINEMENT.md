# v6.1.7 Mission Control UI Refinement

Version: `v6_1_7_mission_control_ui_refinement`

This patch refines the v6.1.6 cockpit UI so the dashboard feels calmer, faster, and more boss-action focused. It does not rebuild the backend, WhatsApp webhook, Supabase schema, auth, cleanup rules, pricing, calendar booking, or voice handling.

## What Changed

- Marcus Today is the first useful dashboard section and now stays limited to the top five priorities.
- Focus Mode remains available from the command strip for a calmer view.
- Lead cards now make the next best action, full phone number, scope, last message, risk, missing info, and quick actions easier to scan.
- A subtle Lead Heat Meter appears when a lead score exists.
- The top command bar is sticky and keeps search, cleanup, QA, settings, and Focus Mode close at hand.
- System Core is presented as a compact status strip instead of a large diagnostic block.
- Empty states now explain what a quiet dashboard means.
- Lead detail now includes a compact Command Timeline / recent activity section.
- Micro-interactions add light hover and button press feedback without heavy animation.
- Colour hierarchy remains consistent: gold for boss priority, cyan for system, amber for follow-up/warning, red for danger, green for healthy/done.

## Preserved Rules

- v6.1.5 Follow-Up Queue pagination, filters, pending buttons, and test follow-up hiding are preserved.
- Cleanup scan still runs only on click.
- Marcus, Fio, and Fion remain protected from cleanup.
- Full phone numbers remain visible inside authenticated/protected app pages.
- Client Files remains Coming Soon until real storage exists.
- No mock folders, fake client file links, or placeholder client folders are shown.
- Price guide remains on hold.
- LIMM Works remains non-GST in the app.
- Calendar auto-booking remains off.
- Voice transcription remains disabled.
- WhatsApp webhook and text-send payload are untouched.

## Live Retest Checklist

1. Open the dashboard.
2. Confirm Marcus Today is the first useful section.
3. Toggle Focus Mode and confirm the page becomes calmer.
4. Confirm lead cards show full phone numbers and clear next actions.
5. Confirm Lead Heat appears where lead score exists.
6. Confirm System Core is compact.
7. Confirm Client Files remains Coming Soon only.
8. Confirm Follow-Up Queue still loads fast and hides completed/test follow-ups by default.
9. Confirm WhatsApp bot still replies after deployment.

## Rollback

If the UI refinement causes issues, revert the v6.1.7 commit and redeploy. No schema, webhook, auth, cleanup, or environment changes are required for rollback.
