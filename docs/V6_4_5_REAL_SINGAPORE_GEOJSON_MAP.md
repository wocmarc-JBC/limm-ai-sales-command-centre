# v6.4.5 Real Singapore GeoJSON Map

Status: implemented locally; pending deploy health proof.

## What Changed

- Replaced the remaining hand-drawn Singapore map base with a local real-geometry GeoJSON asset at `public/maps/singapore.geojson`.
- Added `SingaporeGeoMap` and `singapore-map-geometry` so dashboard pins, HQ marker, and faint area labels use one shared coordinate projection.
- Recalibrated LIMM HQ postal `228397` to Orchard / Dhoby Ghaut / central Singapore using `lat 1.3008`, `lng 103.8375`.
- Added a smaller Sentosa feature instead of a generic oval.
- Removed the large map helper box; the map now uses only subtle no-data guidance.
- Preserved zoom, pan, reset, legend, clickable pins, area halos, privacy-safe area-level display, non-GST proof, price guide hold, Calendar auto-booking off, and voice transcription off.

## Safety Rules Preserved

- No Google Maps, Mapbox, external geocoding, map API keys, or exact-address display on the dashboard map.
- No WhatsApp webhook or send-adapter changes.
- No Supabase schema, auth, delete, price-guide, Calendar, or voice-transcription changes.
- No pricing, quote ranges, package pricing, booking confirmation, or forbidden client wording.

## Health Proof

After deployment, `/api/whatsapp/health` should show:

- `version: v6_4_5_real_singapore_geojson_map`
- `salesBrainVersion: v6.4.5`
- `realSingaporeGeojsonMapAvailable: true`
- `realMapGeometryAssetAvailable: true`
- `manualBlobMapRemoved: true`
- `hqMarkerPostal228397Available: true`
- `hqMarkerCentralSingaporeAvailable: true`
- `mapNoBlockingOverlayAvailable: true`
- `mapBaseAlwaysVisible: true`
- `singaporeMapZoomableAvailable: true`
- `singaporeMapPanAvailable: true`
- `singaporeMapResetZoomAvailable: true`
- `privacySafeMapDisplayAvailable: true`
- `externalGeocodingEnabled: false`
- `googleMapsEnabled: false`

## Retest

1. Confirm health shows `v6_4_5_real_singapore_geojson_map`.
2. Open the dashboard and check the Singapore Mission Map.
3. Confirm HQ sits around Orchard / Dhoby Ghaut, not below the island.
4. Confirm Sentosa is small and island-shaped.
5. Confirm labels are subtle: Orchard, Bukit Timah, Serangoon, Tampines, East Coast, Jurong, Woodlands, and CBD.
6. Confirm zoom, reset, legend, pins, and subtle no-data helper still work.

## Rollback

If the visual fails after deployment, roll back to the previous Vercel deployment or revert the commit containing `public/maps/singapore.geojson`, `components/SingaporeGeoMap.tsx`, and `lib/singapore-map-geometry.ts`.
