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

const mapComponent = read("components/SingaporeMissionMap.tsx");
const dashboard = read("app/page.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const audit = read("scripts/audit_v3_package.mjs");
const packageJson = read("package.json");
const docs = read("docs/V6_4_1_SINGAPORE_TACTICAL_MAP_UI_POLISH.md");
const clientFilesPage = read("app/client-files/page.tsx");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");

assert(mapComponent.includes("data-testid=\"singapore-mission-map\""), "Singapore map component must render with test id.");
assert(mapComponent.includes("singapore-tactical-map"), "Tactical map class must exist.");
assert(mapComponent.includes("singapore-silhouette-map"), "Singapore silhouette class/test id must exist.");
assert(mapComponent.includes("singapore-island-silhouette"), "Singapore island silhouette path must exist.");
assert(mapComponent.includes("viewBox=\"0 0 760 430\""), "Inline tactical Singapore silhouette SVG must be present.");
assert(!mapComponent.includes("rounded-[48%_52%_45%_55%]"), "Old generic oval/radar placeholder must be removed.");
assert(!mapComponent.includes("Area intelligence ready"), "Old generic area intelligence heading must be removed.");
assert(!mapComponent.includes("Hybrid area heatmap + clickable pins"), "Old generic map subtitle must be removed.");

assert(mapComponent.includes("No mapped leads yet"), "Subtle empty state status label missing.");
assert(mapComponent.includes("Add property area or postal code to improve location intelligence."), "Subtle empty state helper missing.");
assert(!mapComponent.includes("-translate-x-1/2 -translate-y-1/2 rounded-2xl border border-command-cyan/25"), "Large centered blocking empty-state overlay must not return.");
assert(!/demo pin|sample pin|fake pin|fake map/i.test(mapComponent), "Map component must not include fake/demo map data.");

for (const legend of [
  "Gold = won / hot lead",
  "Cyan = active lead",
  "Amber = follow-up / appointment",
  "Red = risk / overdue",
  "Green = paid / completed",
  "Grey = unknown / inactive"
]) {
  assert(mapComponent.includes(legend), `Integrated legend missing: ${legend}`);
}

assert(mapComponent.includes("tactical-area-halo"), "Heatmap halos must be visually integrated.");
assert(mapComponent.includes("mission-map-pin"), "Clickable mission pins must be visually integrated.");
assert(mapComponent.includes("href={pin.href || \"#\"}"), "Pins must retain clickable href behavior.");
assert(mapComponent.includes("areaSelectHref(activeFilter, area.area)"), "Area zones must be selectable from the dashboard map.");
assert(mapComponent.includes("map-area-summary-panel"), "Area summary mini panel must exist.");
assert(mapComponent.includes("Click a zone or pin to inspect area activity."), "Area summary empty instruction must exist.");
assert(mapComponent.includes("View leads in area") && mapComponent.includes("View follow-ups"), "Area summary action buttons must exist.");

assert(dashboard.includes("selectedMapArea") && dashboard.includes("selectedArea={selectedMapArea}"), "Dashboard must pass selected map area to the map component.");
assert(!mapComponent.includes("projectAddress"), "Dashboard map must not render projectAddress.");
assert(!mapComponent.includes("project_address"), "Dashboard map must not render raw project_address.");

for (const field of [
  'version: "v6_4_1_singapore_tactical_map_ui_polish"',
  'salesBrainVersion: "v6.4.1"',
  "singaporeTacticalMapUiAvailable",
  "singaporeSilhouetteMapAvailable",
  "mapEmptyStatePolished",
  "mapLegendIntegrated",
  "mapAreaSummaryPanelAvailable",
  "clickableMapPinsAvailable",
  "privacySafeMapDisplayAvailable",
  "externalGeocodingEnabled: false",
  "priceGuideOnHold",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled"
]) {
  assert(health.includes(field), `Health endpoint missing v6.4.1 proof field: ${field}`);
}

assert(health.includes("// version: \"v6_4_singapore_mission_map\""), "Health should keep v6.4 history marker for static regression checks.");
assert(audit.includes("docs/V6_4_1_SINGAPORE_TACTICAL_MAP_UI_POLISH.md"), "Package audit must require v6.4.1 docs.");
assert(audit.includes("scripts/test_v6_4_1_singapore_tactical_map_ui_polish.mjs"), "Package audit must require v6.4.1 test.");
assert(packageJson.includes('"test:v6.4.1"'), "package.json must expose v6.4.1 test script.");
assert(docs.toLowerCase().includes("singapore silhouette") && docs.toLowerCase().includes("live retest checklist"), "v6.4.1 docs must explain tactical map polish and live retest.");

assert(clientFilesPage.includes("Coming Soon") || clientFilesPage.includes("coming soon") || clientFilesPage.includes("not enabled"), "Client Files must remain Coming Soon / not live.");
assert(!/fetch\(|googleapis|maps\.google|mapbox|geocode|GOOGLE_MAPS|MAPBOX/i.test(mapComponent), "No external geocoding or map API key should be added.");
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
  assert(!checkedSources.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden v6.4.1 safety regression found: ${forbidden}`);
}

console.log("PASS: v6.4.1 Singapore Tactical Map UI polish checks passed.");
