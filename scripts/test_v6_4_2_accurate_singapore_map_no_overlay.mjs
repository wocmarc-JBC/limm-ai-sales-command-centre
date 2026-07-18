import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const mapComponent = read("components/SingaporeMissionMap.tsx");
const svgMapComponent = read("components/SingaporeSvgMap.tsx");
const geoMapComponent = read("components/SingaporeGeoMap.tsx");
const commandCore = read("app/command-core/page.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const audit = read("scripts/audit_v3_package.mjs");
const packageJson = read("package.json");
const docs = read("docs/V6_4_2_ACCURATE_SINGAPORE_MAP_NO_OVERLAY.md");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");
const clientFilesPage = read("app/client-files/page.tsx");

assert(svgMapComponent.includes("SingaporeGeoMap"), "SingaporeSvgMap wrapper must delegate to the real GeoJSON map renderer.");
assert(geoMapComponent.includes("accurate-singapore-map"), "Accurate Singapore map class must exist.");
assert(geoMapComponent.includes("singapore-mainland") && geoMapComponent.includes("singapore-island-silhouette"), "Main Singapore island silhouette must exist.");
assert(geoMapComponent.includes("singapore-sentosa"), "Sentosa-only lower island massing must exist.");
assert(!geoMapComponent.includes("singapore-visible-islands"), "Old extra-island cluster must not return.");
assert(geoMapComponent.includes("SINGAPORE_MAP_VIEWBOX"), "Updated wider Singapore map viewBox must use shared GeoJSON geometry.");
assert(geoMapComponent.includes("data-map-source=\"/maps/singapore.geojson\""), "Singapore outline should use the local real GeoJSON asset.");
assert(!mapComponent.includes("rounded-[48%_52%_45%_55%]") && !geoMapComponent.includes("rounded-[48%_52%_45%_55%]"), "Generic oval placeholder shape must be gone.");
assert(!/ellipse|<circle[^>]+className=\"singapore-island-silhouette\"/i.test(mapComponent + svgMapComponent + geoMapComponent), "Map base must not be a generic ellipse/circle.");

assert(!mapComponent.includes("Singapore Mission Map ready"), "Blocking empty-state title must be removed.");
assert(!mapComponent.includes("Add property area or postal code to leads to activate location intelligence."), "Old blocking empty-state copy must be removed.");
assert(!mapComponent.includes("left-1/2 top-1/2 z-20 w-[min(24rem,calc(100%-2rem))]"), "Large centered empty-state card must be removed.");
assert(mapComponent.includes("No mapped leads yet"), "Small empty-state status badge must exist.");
assert(mapComponent.includes("Add property area or postal code to activate location intelligence."), "Small empty-state helper text must exist.");
assert(mapComponent.indexOf("<SingaporeSvgMap />") < mapComponent.indexOf("{mapStatusBadge ?"), "Map base must render before no-data helper labels.");
assert(mapComponent.includes("displayedAreaSummaries.map") && mapComponent.includes("data.pins.map"), "Hybrid heatmap and pins must remain supported.");
assert(mapComponent.includes("href={pin.href || \"#\"}"), "Pins must retain clickable href behavior.");
assert(mapComponent.includes("selectArea(area.area)") && mapComponent.includes("onClick={() => selectArea"), "Area zones must remain clickable/selectable.");
assert(mapComponent.includes("map-area-summary-panel"), "Area summary panel must remain available.");

assert(!mapComponent.includes("projectAddress"), "Dashboard map must not render projectAddress.");
assert(!mapComponent.includes("project_address"), "Dashboard map must not render raw project_address.");
assert(commandCore.includes("CommandCoreMissionMap") && commandCore.includes("buildSingaporeMissionMapData"), "Command Core must render the interactive map and build its live data.");

for (const field of [
  'version: "v6_4_2_accurate_singapore_map_no_overlay"',
  'salesBrainVersion: "v6.4.2"',
  "accurateSingaporeMapAvailable",
  "mapNoBlockingOverlayAvailable",
  "mapBaseAlwaysVisible",
  "subtleEmptyStateHelperAvailable",
  "clickableMapPinsAvailable",
  "privacySafeMapDisplayAvailable",
  "externalGeocodingEnabled: false",
  "priceGuideOnHold",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled"
]) {
  assert(health.includes(field), `Health endpoint missing v6.4.2 proof field: ${field}`);
}

assert(audit.includes("docs/V6_4_2_ACCURATE_SINGAPORE_MAP_NO_OVERLAY.md"), "Package audit must require v6.4.2 docs.");
assert(audit.includes("scripts/test_v6_4_2_accurate_singapore_map_no_overlay.mjs"), "Package audit must require v6.4.2 test.");
assert(packageJson.includes('"test:v6.4.2"'), "package.json must expose v6.4.2 test script.");
assert(docs.toLowerCase().includes("accurate singapore map") && docs.toLowerCase().includes("blocking empty overlay"), "v6.4.2 docs must explain accurate map and overlay removal.");

assert(!/fetch\(|googleapis|maps\.google|mapbox|geocode|GOOGLE_MAPS|MAPBOX|api[_-]?key/i.test(mapComponent + svgMapComponent + geoMapComponent), "No external geocoding or map API key should be added.");
assert(!/demo pin|sample pin|fake pin|fake map/i.test(mapComponent + svgMapComponent + geoMapComponent), "Map component must not include fake/demo map data.");
assert(clientFilesPage.includes("Real client storage") && clientFilesPage.includes("listAllLeadFiles"), "Client Files must use the later repository-backed real storage implementation.");
assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook must remain intact.");
for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `Known-good WhatsApp payload shape missing ${phrase}`);
}

const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";
const checkedSources = [mapComponent, svgMapComponent, geoMapComponent, commandCore, health, docs, whatsappRoute, whatsappAdapter].join("\n");
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
  assert(!checkedSources.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden v6.4.2 safety regression found: ${forbidden}`);
}

console.log("PASS: v6.4.2 accurate Singapore map no-overlay checks passed.");
