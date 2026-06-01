# v6.1.8 Dashboard Compression + Zero-State Polish

Version: `v6_1_8_dashboard_compression_zero_state_polish`

This patch keeps the grand cockpit radar visual and makes it useful. It also compresses dashboard zero states and makes the long desktop sidebar independently scrollable.

## Scrollable Sidebar

- Desktop sidebar uses full viewport height and independent vertical scrolling.
- Sidebar nav keeps the cockpit thin scrollbar style.
- Main content scrolls separately from sidebar content.
- Mobile nav keeps the horizontal strip behavior.
- Active nav styling remains clear.

## Mission Radar

- The radar remains a large hero visual.
- It now shows operational counts for Hot Leads, Needs Marcus, Follow-Up Due, Appointment Requests, Bot Paused, Hacking / Approval Risk, Test Data Detected, and Email Handoff Pending.
- The center status shows the highest priority or an all-clear message.
- The radar includes a compact legend:
  - Gold = hot / priority
  - Cyan = system / bot
  - Amber = follow-up / warning
  - Red = urgent / risk
  - Green = healthy / clear
- The radar shows one contextual action button near the panel.

## Dashboard Compression

- Duplicate "What must Marcus do now?" copy is removed from the visible dashboard.
- Marcus Today remains the main action section with compact "Next Best Action" copy.
- Zero-count mission cards are hidden.
- Repeated zero-state cards are replaced by one compact all-clear strip.
- Empty action queue copy is shortened.

## Preserved Safety

- WhatsApp webhook and text payload are untouched.
- Supabase schema, migrations, auth, delete and hard-delete logic are untouched.
- v6.1.5 Follow-Up Queue performance, test follow-up hiding, pending buttons, and cleanup scan-on-click behavior are preserved.
- Client Files remains Coming Soon only.
- Price guide remains on hold.
- Calendar auto-booking remains off.
- Voice transcription remains disabled.
- LIMM Works remains non-GST in app logic.

## Live Retest

1. Open dashboard.
2. Confirm the sidebar scrolls independently on desktop.
3. Confirm the grand Mission Radar is visible and useful.
4. Confirm radar counts and legend are readable.
5. Confirm one radar action button appears.
6. Confirm Marcus Today is still the first action section.
7. Confirm zero-count mission cards are hidden.
8. Confirm Client Files remains Coming Soon only.
9. Confirm Follow-Up Queue still loads quickly.
10. Confirm WhatsApp bot still replies after deploy.
