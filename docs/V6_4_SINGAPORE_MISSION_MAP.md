# v6.4 Singapore Mission Map

Version: `v6_4_singapore_mission_map`

## What Changed

- Added a dashboard Singapore Mission Map with a hybrid area heatmap and clickable operational pins.
- Added a local Singapore area/postal parser using a static area dictionary only.
- Added optional location metadata fields for leads and won projects.
- Added won job, collection due, overdue, follow-up, appointment, hot lead, and risk layers where data exists.
- Unknown locations stay counted as `Unknown area` instead of being placed on fake pins.
- Test/generated leads are hidden from the map by default.

## Privacy Rules

- The main dashboard map shows area-level context only.
- Full stored address or area notes are not rendered on the dashboard map.
- Protected lead detail may show stored location notes if the data already exists.
- No external geocoding, map API key, or third-party map service is used.

## Map Layers

- Hot leads
- Active leads
- Appointment/site-visit requests
- Follow-ups due or overdue
- Hacking/approval/risk questions
- Won projects
- Outstanding or overdue collection items

## Location Confidence

- `exact`: stored/manual coordinates exist, still displayed as area-level dashboard context.
- `postal`: postal code or prefix mapped to an approximate area centroid.
- `area`: known Singapore area label mapped to an approximate centroid.
- `unknown`: no safe Singapore area could be inferred.

## Safety Preserved

- WhatsApp webhook and send payload were not changed.
- Correct WhatsApp phone number ID remains external environment configuration; the wrong historical ID is not introduced.
- Price guide automation remains on hold.
- Calendar auto-booking remains off.
- Voice transcription remains off.
- LIMM Works remains non-GST in the app proof.
- Marcus/Fio/Fion cleanup protection remains intact.
- Test leads/test follow-ups remain hidden from operational views by default.

## Supabase Migration

Run additive migration:

```sql
supabase/migrations/021_v6_4_singapore_mission_map.sql
```

It adds optional location metadata to `leads` and `project_accounts`:

- property area
- postal code
- protected address/area note
- planning region / area
- optional map latitude / longitude
- location confidence / source / notes

## Live Proof

After deployment, check:

```text
https://limm-ai-sales-command-centre.vercel.app/api/whatsapp/health
```

Expected key fields:

- `version: v6_4_singapore_mission_map`
- `salesBrainVersion: v6.4`
- `singaporeMissionMapAvailable: true`
- `hybridAreaHeatmapAvailable: true`
- `clickableMapPinsAvailable: true`
- `mapAreaSummaryAvailable: true`
- `mapFiltersAvailable: true`
- `privacySafeMapDisplayAvailable: true`
- `locationConfidenceAvailable: true`
- `localSingaporeLocationParserAvailable: true`
- `externalGeocodingEnabled: false`
- `mapHidesTestDataByDefault: true`
- `salesCollectionMapLayerAvailable: true`
- `priceGuideOnHold: true`
- `calendarAutoBookingEnabled: false`
- `voiceTranscriptionEnabled: false`
- `gstRegistered: false`

## Retest

1. Open dashboard.
2. Confirm Singapore Mission Map appears below Mission Radar.
3. Confirm filter chips appear for All, Leads, Hot Leads, Won Jobs, Site Visits, Follow-Ups, Collections, and Overdue / Risk.
4. Confirm area bubbles and pins link to lead, follow-up, or collection views.
5. Confirm unknown locations show as a count, not a fake pin.
6. Confirm full exact addresses are not shown on the main dashboard map.

## Rollback

If the map causes a visual issue, revert the dashboard component import/render and redeploy. The migration is additive and does not remove existing CRM data.
