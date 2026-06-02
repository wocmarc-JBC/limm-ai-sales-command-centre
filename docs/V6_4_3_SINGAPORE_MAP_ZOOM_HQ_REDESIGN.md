# v6.4.3 Singapore Map Zoom + HQ Redesign

Version: `v6_4_3_singapore_map_zoom_hq_redesign`

## Scope

This patch is a dashboard map UI-only upgrade. It does not touch the WhatsApp webhook, Supabase schema, auth, cleanup logic, price guide logic, Calendar booking logic, or voice handling.

## What Changed

- The Singapore Mission Map is wider and taller so it can stay a grand dashboard feature.
- The map now supports desktop wheel zoom, zoom in, zoom out, reset, and panning while zoomed.
- The Singapore base keeps the main island and only one lower Sentosa island. The older extra small islands were removed for a cleaner operational view.
- Gold and amber are visually separated:
  - Gold: `#FFD54A` for hot or won priority signals.
  - Amber: `#FF8A00` / `#FF9F1A` for follow-up or appointment warnings.
- A distinct `LIMM HQ` marker was added near central Singapore using postal code `228397`.
- The HQ tooltip shows `LIMM Works HQ - Postal: 228397`.
- The HQ marker is not a lead pin and does not show a street address.
- The no-data state still shows the full map, HQ marker, controls, and legend, with only a small helper badge.

## Safety Preserved

- No full exact address is shown on the dashboard map.
- No fake map data or sample pins were added.
- No external geocoding, map API, or map key was introduced.
- Test data remains hidden by default through the existing map aggregation layer.
- Price guide automation remains on hold.
- Calendar auto-booking remains disabled.
- Voice transcription remains disabled.
- Known-good WhatsApp text send payload is not changed.

## Health Proof

After deployment, `/api/whatsapp/health` should show:

- `version: v6_4_3_singapore_map_zoom_hq_redesign`
- `salesBrainVersion: v6.4.3`
- `singaporeMapWideLayoutAvailable: true`
- `singaporeMapZoomableAvailable: true`
- `singaporeMapPanAvailable: true`
- `singaporeMapResetZoomAvailable: true`
- `singaporeMapHqMarkerAvailable: true`
- `singaporeMapSentosaOnlyAvailable: true`
- `goldAmberColourSeparationFixed: true`
- `mapNoBlockingOverlayAvailable: true`
- `privacySafeMapDisplayAvailable: true`
- `externalGeocodingEnabled: false`
- `priceGuideOnHold: true`
- `calendarAutoBookingEnabled: false`
- `voiceTranscriptionEnabled: false`

## Live Retest Checklist

1. Wait for Vercel deployment to become Ready.
2. Open `/api/whatsapp/health` and confirm the v6.4.3 version.
3. Open the dashboard.
4. Confirm the Singapore Mission Map is wider and easier to read.
5. Confirm the main Singapore island plus one Sentosa island are visible.
6. Confirm `LIMM HQ` appears on the map and is separate from lead pins.
7. Use zoom in, zoom out, reset, and mouse wheel zoom.
8. Pan the map while zoomed.
9. Confirm gold and amber are visually distinct in pins, heat rings, and legend.
10. Confirm no full exact address is shown on the dashboard map.
11. Confirm the no-data map still shows the base map, HQ marker, controls, and legend without a blocking overlay.

## Rollback

This patch is safe to roll back by reverting:

- `components/SingaporeMissionMap.tsx`
- `app/api/whatsapp/health/route.ts`
- `scripts/test_v6_4_3_singapore_map_zoom_hq_redesign.mjs`
- package/audit/doc wiring for v6.4.3

No Supabase migration rollback is needed because this patch does not change schema.
