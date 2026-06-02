# v6.4.9 Singapore Map Smooth Zoom + Wheel Lock

Status: implemented locally; pending Vercel deploy health proof.

## What Changed

- Kept the official URA/data.gov.sg Master Plan 2019 Planning Area Boundary (No Sea) geometry.
- Improved the default map fit so Singapore fills more of the dashboard panel without cropping.
- Increased zoom range to 400% with bounded `+`, `-`, and reset controls.
- Moved wheel zoom to a non-passive native wheel listener so scrolling over the map controls the map instead of the page.
- Added a small “Scroll to zoom map” affordance.
- Kept pan/drag available when zoomed in, with reset clearing pan, selected pin, selected area, and HQ tooltip state.
- Preserved clickable pins, area bubbles, HQ marker, labels, legend, privacy-safe display, and local-only map rendering.

## Zoom Behavior

- Default zoom is 100%.
- Minimum zoom is 100%.
- Maximum zoom is 400%.
- Button zoom uses a 25% step and a smooth 160ms ease-out transform.
- Wheel zoom uses a smaller step for fine control.

## Wheel Lock

When the pointer is over the map, the wheel event is handled by the map container with `passive: false`.
The handler prevents the default page scroll and stops propagation, so the dashboard page does not move while Marcus is zooming the Singapore Mission Map.

Outside the map, the main dashboard should scroll normally.

## Reset Behavior

Reset restores:

- Zoom to 100%.
- Pan to centre.
- Selected pin cleared.
- Selected area cleared.
- HQ tooltip cleared.
- Drag state cleared.

No refresh is needed.

## Fit / Stretch

The projection padding is tightened while preserving aspect ratio. This keeps the full official Singapore map visible and centred, but uses more of the horizontal space in the cockpit panel.

## Live Retest

After Vercel deploys, open:

`https://limm-ai-sales-command-centre.vercel.app/api/whatsapp/health`

Expected:

- `version: v6_4_9_singapore_map_smooth_zoom_wheel_lock`
- `salesBrainVersion: v6.4.9`
- `mapSmoothZoomControlsAvailable: true`
- `mapWheelZoomAvailable: true`
- `mapWheelPreventsPageScroll: true`
- `mapWheelListenerPassiveFalse: true`
- `mapDefaultFitImproved: true`
- `mapHorizontalSpaceOptimized: true`

Then visually test:

- `+` zoom feels smooth and stops at 400%.
- `-` zoom feels smooth and stops at 100%.
- Wheel over map zooms the map and does not scroll the page.
- Page scroll works normally outside the map.
- Drag/pan works when zoomed in.
- Reset returns to the fitted Singapore view and clears selected map state.
- HQ marker remains around Orchard / Dhoby Ghaut.
- Pins and area bubbles stay aligned.

## Safety / Scope

Not changed:

- WhatsApp webhook and adapter.
- Supabase schema or migrations.
- Auth.
- Delete or hard-delete logic.
- Env/secrets.
- Price guide automation.
- Calendar auto-booking.
- Voice transcription.

No external map API, Google Maps, geocoding API, exact-address dashboard display, fake Sentosa, or hand-drawn Singapore geometry was added.
