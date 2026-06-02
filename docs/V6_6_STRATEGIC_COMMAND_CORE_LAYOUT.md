# v6.6 Strategic Command Core Layout

## What Changed

v6.6 adds `/command-core` as a beta alternate dashboard route. It does not replace the existing dashboard.

The layout is a LIMM-branded strategic command centre experiment with:

- top resource/status bar
- Marcus Decisions panel
- central Command Core with the existing Singapore Mission Map
- right-side Top Lead Inspector
- bottom timeline strip

## Why It Is Beta

This route is for visual and workflow testing. The current dashboard remains the main operating dashboard until Marcus decides the beta layout is better.

## Layout Structure

- Top Resource Bar: live repository counts for leads, appointments, follow-ups, quotes, won sales, collections, overdue items, and paused bots.
- Marcus Decisions: top decision cards generated from real lead/follow-up/sales signals.
- Command Core: real Singapore Mission Map and compact radar counters.
- Inspector: highest-priority lead summary with full phone shown inside the protected CRM.
- Timeline: today, tomorrow, this week, and overdue operational pressure.

## Safety Preservation

- WhatsApp webhook and send payload were not changed.
- Supabase schema and migrations were not changed.
- Auth, cleanup, hard-delete, and environment logic were not changed.
- Price guide automation remains on hold.
- No rough pricing, quote ranges, package pricing, or generated amounts were added.
- Calendar auto-booking remains off.
- Voice transcription remains off.
- LIMM Works remains non-GST; no GST calculations or Tax Invoice wording were added.
- Existing official Singapore map geometry is reused.
- No fake leads, fake client files, fake project values, or fake collection data are shown.

## Live Retest Checklist

1. Open `/command-core`.
2. Confirm the top resource bar appears and scrolls on mobile.
3. Confirm Marcus Decisions appears on the left/first on mobile.
4. Confirm the existing Singapore Mission Map appears in the central panel.
5. Confirm the Inspector panel shows the top lead or a clean empty state.
6. Confirm the timeline strip appears at the bottom.
7. Confirm existing `/` dashboard still works.
8. Confirm no fake client files, fake revenue, or fake map data appears.
9. Confirm WhatsApp still receives and replies normally.
10. Confirm mobile has no horizontal page overflow.
