# v6.4.1 Singapore Tactical Map UI Polish

Version: `v6_4_1_singapore_tactical_map_ui_polish`

## What Changed

- Replaced the generic oval/radar-looking map treatment with a lightweight inline Singapore silhouette.
- Kept the existing v6.4 map data helpers, local Singapore parser, filters, pins, and privacy rules.
- Polished the empty state so it feels like a ready tactical panel, not an error or placeholder.
- Integrated the legend inside the map panel so colours match the tactical pins and heat halos.
- Added a compact area summary panel below the map.
- Area zones can update the inspected dashboard area without exposing full addresses.

## Why The Oval Was Replaced

The previous map was technically correct, but visually read like a generic radar oval. Marcus wanted the panel to feel like a premium Singapore business command map. The new version uses an abstract Singapore island silhouette, faint zone lines, cockpit grid, glow halos, and compact mission pins.

## Singapore Silhouette Approach

- No Google Maps.
- No Mapbox.
- No external geocoding.
- No API key.
- No heavy map library.
- Uses a lightweight inline SVG silhouette and the existing local Singapore area centroid dictionary.

The silhouette is deliberately stylised, not a survey-grade map. It is meant for tactical dashboard awareness, not exact address plotting.

## Empty State Behaviour

If no location data exists, the map shows:

- `Singapore Mission Map ready`
- `Add property area or postal code to leads to activate location intelligence.`
- `Unknown areas: X`

No fake pins or fake locations are shown.

## Legend Colours

- Gold = won / hot lead
- Cyan = active lead
- Amber = follow-up / appointment
- Red = risk / overdue
- Green = paid / completed
- Grey = unknown / inactive

## Privacy Rules

- Dashboard map shows area-level context only.
- Full exact address is not shown on the dashboard map.
- Full stored address/area note may appear only inside protected lead/project detail pages if already stored.
- Unknown locations are counted as `Unknown area` instead of being placed on fake pins.
- Test data stays hidden from map data by default through the existing v6.4 map data helper.

## Live Retest Checklist

1. Open the dashboard.
2. Confirm the map looks like a Singapore tactical panel, not a generic oval.
3. Confirm the empty state is compact and premium if no locations exist.
4. Confirm legend colours match map pins/halos.
5. Confirm area zones and pins remain clickable.
6. Confirm no fake map data appears.
7. Confirm no full exact address appears on the dashboard map.
8. Confirm dashboard still loads fast.
9. Confirm WhatsApp bot still replies.

## Rollback

This is a frontend/UI polish patch only. If the visual treatment needs rollback, revert `components/SingaporeMissionMap.tsx` and the v6.4.1 health/doc/test wiring. No Supabase schema rollback is needed because this patch does not add or change migrations.
