# v6.4.4 Accurate Singapore SVG Mission Map Fix

Version: `v6_4_4_accurate_singapore_svg_map_fix`

## Scope

This is a frontend map UI patch only. It does not change WhatsApp, Supabase schema, auth, cleanup/delete logic, environment variables, price guide automation, Calendar booking, or voice handling.

## Why This Patch Exists

The previous map silhouette was too hand-drawn. It did not read clearly as Singapore, Sentosa was too large, and the HQ marker could appear visually below the island because the base shape was not aligned well enough.

v6.4.4 replaces that weak inline shape with a dedicated local SVG component:

- `components/SingaporeSvgMap.tsx`

The SVG is simplified for dashboard readability, but it is structured around a recognisable Singapore mainland outline rather than a decorative blob.

## Accurate Singapore SVG Approach

- Main island uses a single `singapore-mainland` SVG path.
- Sentosa uses a single `singapore-sentosa` SVG path.
- Extra decorative islands are intentionally removed.
- The base uses local inline SVG only.
- No Google Maps, tile maps, external geocoding, external map API, or API key is required.
- The local SVG approach follows the public-domain Singapore outline reference model, then simplifies it for a cockpit dashboard view.

## Sentosa-Only Rule

The dashboard map shows:

- Singapore mainland
- One small Sentosa island below the south-central area

It does not show extra lower islands, fake floating islands, Pulau Ubin, Jurong Island, or other island clutter in this phase.

## HQ Marker

The permanent HQ marker:

- Label: `LIMM HQ`
- Tooltip: `LIMM Works HQ - Postal: 228397`
- Position: central Singapore, around the Orchard / Dhoby Ghaut / River Valley area
- Marker style: cyan/gold command marker
- Not treated as a lead pin
- No full street address shown

## Zoom / Pan Controls

The map keeps the v6.4.3 interaction model:

- Zoom in
- Zoom out
- Reset
- Desktop wheel zoom
- Pan while zoomed
- Bounded zoom/pan so the map does not disappear
- Pins and HQ marker stay in the transformed map layer

## Gold / Amber Colour Fix

Gold and amber remain clearly separated:

- Gold: `#FFD54A` for hot/won/boss priority
- Amber: `#FF8A00` / `#FF9F1A` for follow-up and appointment warning

Red remains for risk/overdue, cyan for active/system, green for paid/completed, and grey for unknown/inactive.

## Empty State Behaviour

When no mapped lead data exists:

- The full Singapore map remains visible.
- `LIMM HQ` remains visible.
- Zoom controls remain visible.
- Legend remains visible.
- A small `No mapped leads yet` badge appears.
- A small helper says: `Add property area or postal code to activate location intelligence.`
- No large blocking overlay is shown.

## Privacy Rules

The dashboard map remains area-level only:

- No full exact client address.
- No full exact project address.
- No unit number.
- No private address display.
- Lead/project details stay behind protected detail pages if already supported there.

## Live Retest Checklist

1. Open `/api/whatsapp/health`.
2. Confirm `version: v6_4_4_accurate_singapore_svg_map_fix`.
3. Open the dashboard.
4. Confirm the map clearly looks like Singapore.
5. Confirm the random blob/sea-creature shape is gone.
6. Confirm only one small Sentosa island appears below the main island.
7. Confirm `LIMM HQ` appears on the central main island.
8. Confirm the HQ tooltip shows `LIMM Works HQ - Postal: 228397`.
9. Confirm gold and amber look clearly different.
10. Confirm zoom in, zoom out, pan, and reset work.
11. Confirm the map remains visible with no data.
12. Confirm no large overlay blocks the map.
13. Confirm pins/areas are still clickable when data exists.
14. Confirm no full exact address is shown on the dashboard map.
15. Confirm WhatsApp bot still replies.

## Rollback

Rollback is frontend-only:

- Revert `components/SingaporeMissionMap.tsx`
- Revert `components/SingaporeSvgMap.tsx`
- Revert v6.4.4 health/test/doc wiring

No Supabase rollback is needed because no schema changes were made.
