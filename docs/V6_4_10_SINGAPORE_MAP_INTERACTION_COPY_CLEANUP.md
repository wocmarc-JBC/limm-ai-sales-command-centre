# v6.4.10 Singapore Mission Map Interaction + Copy Cleanup

Status: implemented locally; pending Vercel deploy health proof.

## What Changed

- Default zoom remains 100%.
- The top-left map status now renders through one computed badge only.
- The old stacked copy pattern was removed.
- Filter empty states now use compact, specific wording such as `No mapped follow-ups yet` or `No mapped appointments yet`.
- The location helper moved below the map and stays subtle.
- The interaction helper now sits away from the top-left status area: `Scroll to zoom map - Drag to pan - Click zones or pins`.
- `+`, `-`, and Reset controls remain bounded and smooth.
- Wheel zoom still uses the non-passive listener so the page does not scroll while Marcus zooms the map.
- HQ marker is smaller and less overpowering.
- Selected pin and HQ details now also appear in the inspector panel below the map.

## Top-Left Copy Cleanup

The map now chooses one status badge:

- No selected filter and no mapped leads: `No mapped leads yet`
- Empty follow-up filter: `No mapped follow-ups yet`
- Empty hot-lead filter: `No mapped hot leads yet`
- Empty appointment filter: `No mapped appointments yet`
- Empty risk filter: `No mapped risks yet`

It does not show `No mapped leads yet` and `No mapped items for this filter` together.

## Default Zoom

The user confirmed 100% startup zoom is correct.
The default zoom remains 100%.

- `defaultZoom = 1`
- initial display = `100%`
- Reset returns to `100%`

No default zoom-in was added.

## Reset Behavior

Reset uses `resetMapView()` and clears:

- zoom
- pan
- selected pin
- selected area
- HQ selection
- drag state

The map returns to the fitted official Singapore view without refreshing.

## Wheel Lock

The map container keeps a native wheel listener with `{ passive: false }`.
While the pointer is over the map, the wheel zooms the map and prevents main-page scrolling.

Outside the map, normal page scroll remains available.

## Pan / Drag

When zoomed in, the map supports bounded pan/drag.
Dragging is guarded so it does not accidentally open pins.

## Inspector Panel

The inspector panel below the map supports:

- default instruction
- selected area summary
- selected pin details
- HQ marker details with postal `228397`

No full client address is shown.

## Safety / Scope

Not changed:

- Official Singapore geometry.
- WhatsApp webhook.
- WhatsApp adapter payload.
- Supabase schema/migrations.
- Auth.
- Delete or hard-delete logic.
- Env/secrets.
- Price guide automation.
- Calendar auto-booking.
- Voice transcription.

No Google Maps, external tiles, external geocoding, fake map data, or hand-drawn Singapore geometry was added.

## Live Retest

After Vercel deploys, open:

`https://limm-ai-sales-command-centre.vercel.app/api/whatsapp/health`

Expected:

- `version: v6_4_10_singapore_map_interaction_copy_cleanup`
- `salesBrainVersion: v6.4.10`
- `mapDefaultZoomStartsAt100: true`
- `mapTopLeftCopyDeduped: true`
- `mapHelperTextMovedToBottom: true`
- `mapNoStackedStatusLabels: true`
- `mapFilterEmptyStatePolished: true`

Then visually test:

- Map opens at 100%.
- Top-left copy is not double-stacked.
- Only one status badge appears.
- Helper text is subtle and below the map.
- `+` and `-` zoom smoothly.
- Wheel zoom over the map does not scroll the page.
- Page scroll works normally outside the map.
- Drag/pan works when zoomed.
- Reset returns to 100% and clears pan/selection.
- HQ and pin inspectors work.
