# v6.4.6 Official URA / data.gov.sg No-Sea Map Source

Status: source downloader added; official download could not be completed inside this sandbox because outbound network access to `api-open.data.gov.sg` is blocked.

## Official Source

Preferred dataset:

- Master Plan 2019 Planning Area Boundary (No Sea)
- Dataset ID: `d_4765db0e87b9c86336792efe8a1f7a66`
- Source: `https://data.gov.sg/datasets/d_4765db0e87b9c86336792efe8a1f7a66/view`
- Licence: Singapore Open Data Licence

Fallback dataset:

- Master Plan 2019 Region Boundary (No Sea)
- Dataset ID: `d_bf4d24df9129d5a8ff8cf82e20959ee0`
- Source: `https://data.gov.sg/datasets/d_bf4d24df9129d5a8ff8cf82e20959ee0/view`

## What The Downloader Does

Run:

```powershell
npm.cmd run map:download-official
```

The script:

- Calls the official data.gov.sg `poll-download` endpoint.
- Downloads the official URA GeoJSON once.
- Rounds coordinates to six decimal places for a lighter local file.
- Writes:
  - `public/maps/singapore-planning-area-no-sea.geojson`
  - `public/maps/singapore.geojson`
  - `lib/singapore-map-data.json`
- Keeps the dashboard rendering local GeoJSON only.
- Does not add Google Maps, external tiles, external geocoding, or runtime API calls.

Fallback command:

```powershell
node scripts/download_official_singapore_map.mjs region
```

## Important Limitation

Codex could not complete the download in this sandbox:

- PowerShell / curl could not connect to `api-open.data.gov.sg`.
- Therefore the current committed map asset has not yet been replaced with the official URA file.

Marcus should run `npm.cmd run map:download-official` from a normal internet-connected PowerShell, then run:

```powershell
npm.cmd run build
node scripts/test_v6_4_5_real_singapore_geojson_map.mjs
node scripts/audit_v3_package.mjs
```

After that, commit and push the downloaded official asset.
