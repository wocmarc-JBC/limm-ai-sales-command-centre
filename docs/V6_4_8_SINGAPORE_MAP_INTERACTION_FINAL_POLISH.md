# v6.4.8 Singapore Map Interaction Final Polish

Status: implemented locally; pending deploy health proof.

## What Changed

- Preserved the official URA/data.gov.sg Master Plan 2019 Planning Area Boundary (No Sea) GeoJSON.
- Tightened default map fit by reducing projection padding and expanding the SVG map layer inside the panel.
- Added stable zoom constants: default `1`, minimum `1`, maximum `3`, and step `0.25`.
- Fixed Reset to restore default zoom, clear pan, clear selected pin, clear selected area, clear HQ tooltip, and return to the fitted Singapore view.
- Added disabled/dim states for zoom out at minimum zoom and zoom in at maximum zoom.
- Kept pan/drag support when zoomed in and bounded pan so the map cannot disappear.
- Added click summaries for areas, pins, and the LIMM HQ marker.
- Added small area count bubbles driven by real map data only.
- Made selected filters affect visible area bubbles as well as pins.
- Polished major labels down to Woodlands, Jurong, Bukit Timah, Orchard / CBD, Serangoon, Tampines, and East Coast.
- Kept the compact no-data state: map visible, HQ visible, small no-data badge, and subtle helper text only.

## Official Geometry

The map still uses:

- `public/maps/singapore-planning-area-no-sea.geojson`
- `public/maps/singapore.geojson`
- `lib/singapore-map-data.json`

All three are based on the official URA/data.gov.sg planning-area dataset. No Google Maps, external tiles, runtime geocoding, or external map API key is used.

## Reset Behaviour

The Reset button calls `resetMapView()` and restores:

- zoom to the default fit
- pan X/Y to `0`
- selected pin to `null`
- selected area to empty
- HQ tooltip to closed

The zoom percentage returns to `100%` without needing a page refresh.

## Zoom Behaviour

- `+` zooms in by `0.25`.
- `-` zooms out by `0.25`.
- Zoom is bounded between `1` and `3`.
- Buttons are disabled/dimmed at their limits.
- Pins, labels, HQ marker, and area bubbles remain in the same transformed map layer.

## Pan / Drag Behaviour

When zoomed in, the map can be dragged. Pan is bounded based on the current zoom level. Dragging is tracked so an accidental drag does not trigger pin or area selection.

## Map Click Behaviour

- Clicking an area bubble shows an area summary panel.
- Clicking a pin opens a small selected-pin summary with an `Open item` link.
- Clicking the HQ marker shows `LIMM Works HQ` and `Postal: 228397`.
- HQ remains an office marker only, not a lead pin.

## Filter Behaviour

The map filters remain:

- All
- Leads
- Hot Leads
- Won Jobs
- Site Visits
- Follow-Ups
- Collections
- Overdue / Risk

When a filter is selected, pins are filtered by the existing mission-map data layer and area bubbles are limited to areas that still have visible filtered pins. If no mapped items exist for the selected filter, the map shows a small note only.

## Privacy And Safety

- Dashboard map remains area-level only.
- Full exact addresses are not rendered in the map.
- No fake lead pins or fake map data are generated.
- Price guide remains on hold.
- Calendar auto-booking remains off.
- Voice transcription remains off.
- WhatsApp webhook and send adapter were not touched.
- Supabase schema, auth, and delete logic were not touched.

## Live Retest Checklist

1. Open the dashboard.
2. Click `+` and confirm visible zoom in.
3. Click `-` and confirm visible zoom out.
4. Click Reset and confirm the map returns to the fitted Singapore view.
5. Zoom in, pan, then Reset; confirm pan clears.
6. Click the HQ marker and confirm `LIMM Works HQ / Postal: 228397`.
7. Click an area bubble and confirm the summary panel updates.
8. Click a pin if available and confirm its summary and `Open item` link.
9. Click filters and confirm the map changes without fake data.
10. Confirm no full exact address appears on the dashboard map.
11. Confirm the dashboard remains responsive.
12. Confirm WhatsApp still replies.
