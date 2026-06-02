# v6.4.2 Accurate Singapore Map No Overlay

Version: `v6_4_2_accurate_singapore_map_no_overlay`

## What Changed

- Replaced the abstract Singapore tactical base with a more accurate inline Singapore map silhouette.
- Added main island detail plus visible island massing for a clearer Singapore read.
- Removed the large centered empty-state overlay from the map.
- The map base now remains visible even when there are no mapped leads.
- Empty-state guidance is now a small badge/helper label only.
- Heatmap halos, clickable pins, filters, legend, and area summary panel are preserved.

## Accurate Singapore Map Approach

The dashboard still uses a lightweight local vector, not a web map. The map is an inline SVG with:

- more recognisable Singapore main-island coastline
- visible island massing where practical
- subtle region guide lines
- cockpit grid and dark water/land contrast
- no external tiles
- no geocoding calls
- no map API key

It is designed for tactical dashboard awareness, not survey-grade boundaries.

## Why The Blocking Empty Overlay Was Removed

The previous empty state sat on top of the map and made the map feel hidden. In v6.4.2, the map itself is always visible. When no mapped lead data exists, Marcus sees:

- `No mapped leads yet`
- `Unknown area: X`
- `Add property area or postal code to improve location intelligence.`

These are small labels only and do not block the map.

## Empty State Behaviour

- Singapore map base stays visible.
- No fake pins are shown.
- Unknown locations remain counted.
- Helper copy is small and unobtrusive.
- Filters and area summary remain available.

## Privacy Rules

- Dashboard map remains area-level only.
- Full exact client/site addresses are not shown on the dashboard map.
- Full stored address or area notes remain limited to protected detail pages if already supported.
- Test data remains hidden by default through the existing v6.4 map data helper.

## Live Retest Checklist

1. Open dashboard.
2. Confirm map clearly looks like Singapore.
3. Confirm no big overlay message blocks the map.
4. Confirm map stays visible even with no data.
5. Confirm helper text is subtle.
6. Confirm pins/areas remain clickable.
7. Confirm no fake map data appears.
8. Confirm no full exact address appears on dashboard map.
9. Confirm dashboard remains fast.
10. Confirm WhatsApp bot still replies.

## Rollback

This is a UI-only patch. Roll back `components/SingaporeMissionMap.tsx` and the v6.4.2 docs/test/health wiring if needed. No Supabase migration rollback is required.
