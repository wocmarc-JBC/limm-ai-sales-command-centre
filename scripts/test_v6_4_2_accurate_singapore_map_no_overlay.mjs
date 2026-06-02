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
const dashboard = read("app/page.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const audit = read("scripts/audit_v3_package.mjs");
const packageJson = read("package.json");
const docs = read("docs/V6_4_2_ACCURATE_SINGAPORE_MAP_NO_OVERLAY.md");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");
const clientFilesPage = read("app/client-files/page.tsx");

assert(mapComponent.includes("accurate-singapore-map"), "Accurate Singapore map class must exist.");
assert(mapComponent.includes("singapore-island-silhouette"), "Main Singapore island silhouette must exist.");
assert(mapComponent.includes("sentosa-island") && mapComponent.includes("singapore-sentosa-only"), "Sentosa-only lower island massing must exist.");
assert(!mapComponent.includes("singapore-visible-islands"), "Old extra-island cluster must not return.");
assert(mapComponent.includes("viewBox=\"0 0 760 430\""), "Updated wider Singapore map viewBox must exist.");
assert(mapComponent.includes("M59 225 L82 203"), "Singapore outline should use the updated detailed local vector path.");
assert(!mapComponent.includes("rounded-[48%_52%_45%_55%]"), "Generic oval placeholder shape must be gone.");
assert(!/ellipse|<circle[^>]+className=\"singapore-island-silhouette\"/i.test(mapComponent), "Map base must not be a generic ellipse/circle.");

assert(!mapComponent.includes("Singapore Mission Map ready"), "Blocking empty-state title must be removed.");
assert(!mapComponent.includes("Add property area or postal code to leads to activate location intelligence."), "Old blocking empty-state copy must be removed.");
assert(!mapComponent.includes("left-1/2 top-1/2 z-20 w-[min(24rem,calc(100%-2rem))]"), "Large centered empty-state card must be removed.");
assert(mapComponent.includes("No mapped leads yet"), "Small empty-state status badge must exist.");
assert(mapComponent.includes("Add property area or postal code to improve location intelligence."), "Small empty-state helper text must exist.");
assert(mapComponent.indexOf("<SingaporeSilhouette />") < mapComponent.indexOf("{!hasMapData ?"), "Map base must render before no-data helper labels.");
assert(mapComponent.includes("data.areaSummaries.map") && mapComponent.includes("data.pins.map"), "Hybrid heatmap and pins must remain supported.");
assert(mapComponent.includes("href={pin.href || \"#\"}"), "Pins must retain clickable href behavior.");
assert(mapComponent.includes("areaSelectHref(activeFilter, area.area)"), "Area zones must remain clickable/selectable.");
assert(mapComponent.includes("map-area-summary-panel"), "Area summary panel must remain available.");

assert(!mapComponent.includes("projectAddress"), "Dashboard map must not render projectAddress.");
assert(!mapComponent.includes("project_address"), "Dashboard map must not render raw project_address.");
assert(dashboard.includes("SingaporeMissionMap") && dashboard.includes("selectedArea={selectedMapArea}"), "Dashboard must render map and selected area support.");

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

assert(!/fetch\(|googleapis|maps\.google|mapbox|geocode|GOOGLE_MAPS|MAPBOX|api[_-]?key/i.test(mapComponent), "No external geocoding or map API key should be added.");
assert(!/demo pin|sample pin|fake pin|fake map/i.test(mapComponent), "Map component must not include fake/demo map data.");
assert(clientFilesPage.includes("Coming Soon") || clientFilesPage.includes("coming soon") || clientFilesPage.includes("not enabled"), "Client Files must remain Coming Soon / not live.");
assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook must remain intact.");
for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `Known-good WhatsApp payload shape missing ${phrase}`);
}

const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";
const checkedSources = [mapComponent, dashboard, health, docs, whatsappRoute, whatsappAdapter].join("\n");
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
