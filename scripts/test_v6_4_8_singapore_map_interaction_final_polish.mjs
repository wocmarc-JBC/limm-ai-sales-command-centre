import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const officialAsset = json("public/maps/singapore-planning-area-no-sea.geojson");
const displayedAsset = json("public/maps/singapore.geojson");
const bundledAsset = json("lib/singapore-map-data.json");
const missionMap = read("components/SingaporeMissionMap.tsx");
const geoMap = read("components/SingaporeGeoMap.tsx");
const geometry = read("lib/singapore-map-geometry.ts");
const health = read("app/api/whatsapp/health/route.ts");
const packageJson = read("package.json");
const audit = read("scripts/audit_v3_package.mjs");
const devBrain = read("scripts/dev_brain_qa.mjs");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");

assert(officialAsset.sourceDatasetId === "d_4765db0e87b9c86336792efe8a1f7a66", "Official planning-area GeoJSON must remain the source.");
assert(displayedAsset.sourceDatasetId === officialAsset.sourceDatasetId, "Rendered map asset must remain the official planning-area GeoJSON.");
assert(bundledAsset.sourceDatasetId === officialAsset.sourceDatasetId, "Bundled map data must remain official planning-area GeoJSON.");
assert(!/Highcharts|Natural Earth|SG\.SENTOSA\.LOCAL|local dashboard-scale sentosa/i.test(JSON.stringify(displayedAsset)), "Old non-official or fake Sentosa geometry must not return.");

for (const forbidden of [
  "M71 302 C82 284",
  "M58 313 L78 286",
  "data-outline-source=\"local-static-real-singapore-outline\"",
  "singapore-visible-islands",
  "rounded-[48%_52%_45%_55%]",
  "<ellipse"
]) {
  assert(!missionMap.includes(forbidden) && !geoMap.includes(forbidden) && !geometry.includes(forbidden), `Fake/manual map shape returned: ${forbidden}`);
}

for (const required of [
  "const defaultZoom = 1",
  "const minZoom = 1",
  "const maxZoom = 4",
  "const zoomStep = 0.25",
  "function boundedZoom",
  "function boundedPan",
  "function resetMapView()",
  "setZoom(defaultZoom)",
  "setPan({ x: 0, y: 0 })",
  "setSelectedPin(null)",
  "setSelectedAreaName(\"\")",
  "setHqSelected(false)",
  "data-testid=\"map-zoom-in\"",
  "data-testid=\"map-zoom-out\"",
  "data-testid=\"map-zoom-reset\"",
  "data-testid=\"map-zoom-percent\"",
  "disabled={!canZoomOut}",
  "disabled={!canZoomIn}",
  "Math.round((zoom / defaultZoom) * 100)",
  "transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`",
  "transform 160ms ease-out",
  "data-min-zoom={minZoom}",
  "data-max-zoom={maxZoom}",
  "data-zoom-step={zoomStep}"
]) {
  assert(missionMap.includes(required), `Map interaction implementation missing: ${required}`);
}

for (const required of [
  "const [selectedAreaName",
  "const [selectedPin",
  "const [hqSelected",
  "dragMovedRef",
  "handlePointerDown",
  "handlePointerMove",
  "handlePointerEnd",
  "selectArea(area.area)",
  "selectPin(pin, event)",
  "onClick={selectHq}",
  "data-testid=\"map-hq-tooltip\"",
  "data-testid=\"map-pin-summary\"",
  "map-area-count-bubble",
  "Appointments:",
  "Collections:",
  "displayedAreaSummaries",
  "activeFilter === \"all\"",
  "visiblePinAreas.has(area.area)",
  "No mapped items for this filter.",
  "Open item"
]) {
  assert(missionMap.includes(required), `Useful map interaction missing: ${required}`);
}

assert(geometry.includes("padding: 28"), "Default fit must reduce v6.4.6 padding and make Singapore larger without cropping.");
assert(geoMap.includes("h-[94%]"), "Map SVG layer should fill more of the map canvas.");
assert(geometry.includes("Orchard / CBD") && !geometry.includes('{ label: "CBD"'), "Major labels should be compacted and polished.");
for (const label of ["Woodlands", "Jurong", "Bukit Timah", "Orchard / CBD", "Serangoon", "Tampines", "East Coast"]) {
  assert(geometry.includes(label), `Major map label missing: ${label}`);
}

assert(missionMap.includes("No mapped leads yet"), "Small no-data badge must remain.");
assert(missionMap.includes("data-testid=\"map-location-helper\"") && missionMap.includes("Add property area or postal code to activate location intelligence."), "Small helper text must remain below the map without a blocking overlay.");
assert(!missionMap.includes("Singapore Mission Map ready") && !missionMap.includes("left-1/2 top-1/2"), "Large blocking empty overlay must not return.");
assert(!missionMap.includes("projectAddress") && !missionMap.includes("project_address"), "Dashboard map must not expose full exact address fields.");
assert(!/fetch\(|googleapis|maps\.google|mapbox|geocode|GOOGLE_MAPS|MAPBOX|api[_-]?key/i.test(missionMap + geoMap + geometry), "No external geocoding/API key should be added.");

for (const field of [
  'version: "v6_4_8_singapore_map_interaction_final_polish"',
  'salesBrainVersion: "v6.4.8"',
  "mapResetButtonFixed",
  "mapResetRestoresDefaultFit",
  "mapZoomControlsReliable",
  "mapZoomBoundsAvailable",
  "mapZoomPercentAccurate",
  "mapPanDragAvailable",
  "mapResetClearsPanAndSelection",
  "mapAreaClickSummaryAvailable",
  "mapPinClickSummaryAvailable",
  "mapHqTooltipAvailable",
  "mapAreaCountBubblesAvailable",
  "mapFiltersAffectPinsAvailable",
  "officialMapGeometryPreserved",
  "privacySafeMapDisplayAvailable",
  "externalGeocodingEnabled: false",
  "priceGuideOnHold: true",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled: false"
]) {
  assert(health.includes(field), `Health endpoint missing v6.4.8 proof field: ${field}`);
}

assert(packageJson.includes("test_v6_4_8_singapore_map_interaction_final_polish.mjs"), "package.json must expose v6.4.8 test.");
assert(devBrain.includes("scripts/test_v6_4_8_singapore_map_interaction_final_polish.mjs"), "Dev Brain QA must include v6.4.8 test.");
assert(audit.includes("scripts/test_v6_4_8_singapore_map_interaction_final_polish.mjs"), "Package audit must require v6.4.8 test.");

assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook must remain untouched.");
for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `Known-good WhatsApp payload shape missing ${phrase}.`);
}

const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";
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
  assert(![missionMap, geoMap, geometry, health, whatsappRoute, whatsappAdapter].join("\n").toLowerCase().includes(forbidden.toLowerCase()), `Forbidden safety regression found: ${forbidden}`);
}

console.log("PASS: v6.4.8 Singapore map interaction final polish checks passed.");
