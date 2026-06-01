import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const location = read("lib/singapore-location.ts");
const missionMap = read("lib/mission-map.ts");
const mapComponent = read("components/SingaporeMissionMap.tsx");
const dashboard = read("app/page.tsx");
const leadDetail = read("app/leads/[id]/page.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const types = read("lib/types.ts");
const migration = read("supabase/migrations/021_v6_4_singapore_mission_map.sql");
const migrationOrder = read("supabase/MIGRATION_ORDER.md");
const packageJson = read("package.json");
const followupTest = read("scripts/test_v6_1_5_performance_followup_test_cleanup.mjs");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const cleanupRules = read("lib/test-lead-cleanup.ts");

for (const phrase of [
  "Ang Mo Kio",
  "Tampines",
  "Jurong",
  "Bukit Timah",
  "Serangoon Gardens",
  "District 15".toLowerCase(),
  "upper thomson",
  "postalPrefixArea",
  "extractSingaporePostalCode",
  "normalizeAreaName",
  "inferSingaporeLocation"
]) {
  assert(location.toLowerCase().includes(phrase.toLowerCase()), `Location parser missing area/parser coverage: ${phrase}`);
}

assert(/\\d\{6\}/.test(location), "Location parser must detect six-digit Singapore postal codes.");
assert(location.includes("Unknown area"), "Location parser must return Unknown area for unmapped locations.");
assert((location.match(/lat:/g) ?? []).length >= 25, "Static centroid dictionary must contain a useful Singapore area set.");
assert(!/fetch\(|googleapis|maps\.google|mapbox|geocode/i.test(location + missionMap + mapComponent), "Mission map must not use external geocoding or map APIs.");
assert(!/api[_-]?key|GOOGLE_MAPS|MAPBOX/i.test(location + missionMap + mapComponent), "Mission map must not require a map API key.");

for (const phrase of [
  "MissionMapFilter",
  "MissionMapPin",
  "MissionMapAreaSummary",
  "buildSingaporeMissionMapData",
  "areaSummaries",
  "pins",
  "unknownLocationCount",
  "filters",
  "addArea",
  "hotLeadCount",
  "followUpDueCount",
  "collectionDueCount",
  "overdueCount",
  "riskCount"
]) {
  assert(missionMap.includes(phrase), `Mission map aggregation missing ${phrase}`);
}

assert(missionMap.includes("scoreTestLead(lead).clearlyTest"), "Mission map must hide obvious test leads by default.");
assert(missionMap.includes("lead.deletedAt") && missionMap.includes("lead.archivedAt") && missionMap.includes("lead.isSpam") && missionMap.includes("lead.isTest"), "Mission map must exclude inactive/test/spam leads.");
assert(missionMap.includes("Unknown area") && missionMap.includes("continue"), "Unknown locations must be counted without fake pins.");
assert(/if \(!location\.lat \|\| !location\.lng \|\| location\.area === "Unknown area"\)/.test(missionMap), "Pins must require a valid local/approximate location.");
assert(missionMap.includes("missionMapColorClass"), "Mission map color mapping must be centralized.");
for (const category of ["hot", "active", "follow_up", "risk", "won", "paid", "unknown"]) {
  assert(missionMap.includes(`${category}:`), `Mission map color category missing: ${category}`);
}

for (const phrase of [
  "SingaporeMissionMap",
  "Hybrid area heatmap + clickable pins",
  "Unknown area:",
  "Singapore Mission Map is ready.",
  "Gold = won / hot",
  "Cyan = active lead",
  "Amber = follow-up / collection",
  "Red = urgent / overdue",
  "Green = paid / complete",
  "href={`/leads?area=",
  "href={pin.href || \"#\"}",
  "Main map shows area-level context, not full addresses."
]) {
  assert(mapComponent.includes(phrase), `SingaporeMissionMap component missing ${phrase}`);
}

assert(!mapComponent.includes("projectAddress"), "Dashboard map component must not render full project addresses.");
assert(!mapComponent.includes("project_address"), "Dashboard map component must not render raw project_address values.");
assert(leadDetail.includes("Location Intelligence"), "Protected lead detail should expose location intelligence when stored.");
assert(leadDetail.includes("Stored address / area note"), "Full stored address/area note must stay on protected lead detail, not dashboard map.");
assert(dashboard.includes("SingaporeMissionMap") && dashboard.includes("buildSingaporeMissionMapData"), "Dashboard must render the Singapore Mission Map component.");
assert(dashboard.includes("listProjectAccounts") && dashboard.includes("listPaymentRecords"), "Dashboard map must include v6.3 won/collection layers.");

for (const field of [
  "propertyArea",
  "postalCode",
  "projectAddress",
  "planningRegion",
  "planningArea",
  "mapLat",
  "mapLng",
  "locationConfidence",
  "locationSource",
  "locationNotes"
]) {
  assert(types.includes(field), `Location type field missing: ${field}`);
  assert(migration.includes(field.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)), `v6.4 migration missing column for ${field}`);
}

for (const field of [
  'version: "v6_4_singapore_mission_map"',
  'salesBrainVersion: "v6.4"',
  "singaporeMissionMapAvailable",
  "hybridAreaHeatmapAvailable",
  "clickableMapPinsAvailable",
  "mapAreaSummaryAvailable",
  "mapFiltersAvailable",
  "privacySafeMapDisplayAvailable",
  "locationConfidenceAvailable",
  "localSingaporeLocationParserAvailable",
  "externalGeocodingEnabled: false",
  "mapHidesTestDataByDefault",
  "salesCollectionMapLayerAvailable",
  "priceGuideOnHold",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled",
  "gstRegistered: false"
]) {
  assert(health.includes(field), `Health endpoint missing v6.4 proof field: ${field}`);
}

assert(migrationOrder.includes("021_v6_4_singapore_mission_map.sql"), "Migration order must include v6.4 location migration.");
assert(packageJson.includes('"test:v6.4"') && packageJson.includes("test_v6_4_singapore_mission_map.mjs"), "package.json must wire v6.4 test script.");
assert(followupTest.includes("v615FollowupPerformancePreserved") || health.includes("v615FollowupPerformancePreserved"), "v6.1.5 follow-up performance proof must remain preserved.");
assert(health.includes("priceGuideOnHold: true") && health.includes("priceGuideAutomationEnabled: false"), "Price guide must remain on hold.");
assert(health.includes("calendarAutoBookingEnabled: calendar.autoBookingEnabled") && health.includes("voiceTranscriptionEnabled: false"), "Calendar auto-booking and voice transcription must remain disabled in proof.");
assert(health.includes("gstRegistered: false") && health.includes("nonGstModeAvailable: true"), "Non-GST mode must remain preserved.");
assert(cleanupRules.includes("Marcus") && cleanupRules.includes("Fio") && cleanupRules.includes("Fion"), "Marcus/Fio/Fion cleanup protection must remain.");

for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `Known-good WhatsApp payload shape missing ${phrase}`);
}
assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook must remain intact.");

const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";
const scannedSources = [
  location,
  missionMap,
  mapComponent,
  dashboard,
  leadDetail,
  health,
  migration,
  whatsappAdapter,
  whatsappRoute
].join("\n");

for (const forbidden of [
  wrongWhatsAppPhoneNumberId,
  "free consultation",
  "rough price",
  "price range",
  "package price",
  "appointment confirmed",
  "booked for you",
  "Tax " + "Invoice"
]) {
  assert(!scannedSources.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden v6.4 safety regression found: ${forbidden}`);
}

console.log("PASS: v6.4 Singapore Mission Map checks passed.");
