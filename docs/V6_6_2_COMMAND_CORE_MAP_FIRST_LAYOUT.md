# v6.6.2 Command Core Map-First Layout

## What Changed

`/command-core` now uses a map-first layout. The Singapore Mission Map is the hero module and spans the full command-core content width before the supporting panels.

## Why The 3-Column Squeeze Layout Was Removed

The earlier beta placed Marcus Decisions, the map, and Inspector in one row. That made the map too small and weakened the command-screen feel. v6.6.2 moves Marcus Decisions, Inspector, and Timeline below the map so the map is not squeezed by side panels.

## Map-First Layout

- Top resource bar remains full width.
- Singapore Mission Map is a full-width hero section.
- Map wrapper uses full panel width.
- Map height is boosted on desktop so it feels closer to the original dashboard map.
- Official Singapore geometry is reused unchanged.
- Zoom, pan, reset, privacy-safe display, and area-level logic are preserved.

## Resource Bar Readability

The top resource counters now use darker cockpit cards with higher contrast text and colour dots:

- Cyan for new/active signals
- Gold for hot/won signals
- Amber for appointment, follow-up, and collection pressure
- Red for overdue/risk
- Green for healthy/completed signals
- Slate for muted/paused signals

## Supporting Panels

Below the map:

- Marcus Decisions
- Inspector
- Timeline / Activity

These panels no longer constrain map width.

## Live Retest Checklist

1. Open `/command-core`.
2. Confirm the map is the full-width hero.
3. Confirm the map is similar in size to the original dashboard map.
4. Confirm left/right panels no longer squeeze the map.
5. Confirm the top resource bar is readable and dark, not pale.
6. Confirm Marcus Decisions appears below/separate.
7. Confirm Inspector appears below/separate.
8. Confirm Timeline is compact.
9. Confirm existing dashboard `/` still works.
10. Confirm WhatsApp bot still replies.
