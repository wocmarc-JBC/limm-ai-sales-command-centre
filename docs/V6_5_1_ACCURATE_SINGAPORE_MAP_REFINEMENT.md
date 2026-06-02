# v6.5.1 Accurate Singapore Map Refinement

Status: implemented locally; pending push/deploy health proof.

## What Changed

- Replaced the previous weak mainland path with a more accurate local static Singapore outline path.
- Kept the map fully local: no Google Maps, no external map API, no geocoding calls, and no new privacy exposure.
- Recalibrated the map projection frame so the LIMM HQ marker for postal `228397` sits around Orchard / Dhoby Ghaut / central Singapore instead of below the island.
- Refined Sentosa into a smaller, slimmer island-shaped path instead of an oval-like shape.
- Removed the large helper box from the map area and kept only subtle small helper text.
- Added faint area labels: Orchard, Bukit Timah, Serangoon, Tampines, East Coast, Jurong, Woodlands, and CBD.
- Kept zoom controls, reset control, legend, clickable pins, area halos, and privacy-safe area display.

## Regression Tests

New test:

```powershell
node scripts/test_v6_5_1_accurate_singapore_map_refinement.mjs
```

The test fails if:

- The old hand-tuned mainland path returns.
- HQ projects below the central mainland area.
- Sentosa becomes oversized or round/oval-like.
- Area labels disappear.
- The large helper box returns.
- Zoom controls or legend disappear.
- External map/geocoding API usage appears.

## Health Proof

After deployment, open:

```text
https://limm-ai-sales-command-centre.vercel.app/api/whatsapp/health
```

Expected fields:

- `version: v6_5_1_accurate_singapore_map_refinement`
- `salesBrainVersion: v6.5.1`
- `realSingaporeOutlineAvailable: true`
- `hqMarkerCentralSingaporeCalibrated: true`
- `sentosaScaledShapeRefined: true`
- `mapAreaLabelsAvailable: true`
- `largeMapHelperBoxRemoved: true`
- `privacySafeMapDisplayAvailable: true`
- `externalGeocodingEnabled: false`

## Marcus Visual Retest

1. Open the live dashboard after Vercel deploys the latest commit.
2. Confirm the health endpoint shows `v6_5_1_accurate_singapore_map_refinement`.
3. Confirm the map reads as Singapore, not a generic blob.
4. Confirm LIMM HQ sits around central Singapore / Orchard / Dhoby Ghaut.
5. Confirm Sentosa is small and island-like.
6. Confirm the area labels are faint and not cluttered.
7. Confirm the small no-data helper text appears without a large helper box.
8. Confirm zoom controls and legend remain.

## Safety

- No WhatsApp webhook change.
- No Supabase schema change.
- No auth/delete/env/secrets change.
- No external map API.
- No full exact address shown on the dashboard map.
