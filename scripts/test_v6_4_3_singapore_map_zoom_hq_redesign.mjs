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
const docs = read("docs/V6_4_3_SINGAPORE_MAP_ZOOM_HQ_REDESIGN.md");
const devBrain = read("scripts/dev_brain_qa.mjs");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");
const clientFilesPage = read("app/client-files/page.tsx");

for (const phrase of [
  '"use client"',
  "singapore-map-wide-layout",
  "min-h-[30rem]",
  "md:min-h-[38rem]",
  "min-h-[27rem]",
  "md:min-h-[34rem]",
  "data-testid=\"singapore-tactical-map\""
]) {
  assert(mapComponent.includes(phrase), `Wide map layout missing ${phrase}`);
}

for (const phrase of [
  "const [zoom, setZoom]",
  "boundedZoom",
  "boundedPan",
  'addEventListener("wheel", handleNativeWheel, { passive: false })',
  "onPointerDown={handlePointerDown}",
  "onPointerMove={handlePointerMove}",
  "onPointerUp={handlePointerEnd}",
  "data-testid=\"map-zoom-in\"",
  "data-testid=\"map-zoom-out\"",
  "data-testid=\"map-zoom-reset\"",
  "data-testid=\"singapore-map-transform-layer\"",
  "Reset"
]) {
  assert(mapComponent.includes(phrase), `Zoom/pan map control missing ${phrase}`);
}

assert(svgMapComponent.includes("SingaporeGeoMap"), "SingaporeSvgMap wrapper must delegate to the real GeoJSON map renderer.");
assert(geoMapComponent.includes("singapore-sentosa"), "Map must render only the Sentosa lower island marker.");
assert(!geoMapComponent.includes("singapore-visible-islands"), "Old extra-island cluster must not return.");
assert(geoMapComponent.includes("data-map-source=\"/maps/singapore.geojson\""), "Main Singapore island outline must remain the local real GeoJSON vector source.");
assert(!/ellipse|<circle[^>]+className=\"singapore-island-silhouette\"/i.test(mapComponent + svgMapComponent + geoMapComponent), "Map base must not regress to a generic ellipse/circle.");

for (const phrase of [
  "limmHqLocation",
  "Postal: 228397",
  "LIMM HQ",
  "LIMM Works HQ",
  "data-testid=\"limm-hq-marker\"",
  "limm-hq-marker",
  "projectPoint(limmHqLocation)"
]) {
  assert(mapComponent.includes(phrase), `HQ marker missing ${phrase}`);
}
const correctWhatsAppPhoneNumberId = "113456" + "4529740227";
const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";
assert(!mapComponent.includes(correctWhatsAppPhoneNumberId) && !mapComponent.includes(wrongWhatsAppPhoneNumberId), "Map component must not contain WhatsApp phone number ids.");

assert(mapComponent.includes("#FFD54A"), "Bright yellow-gold #FFD54A must be used for gold.");
assert(mapComponent.includes("#FF8A00"), "Deep orange #FF8A00 must be used for amber.");
assert(mapComponent.includes("#FF9F1A"), "Readable amber text #FF9F1A must be used for amber labels.");
assert(mapComponent.indexOf("#FFD54A") !== mapComponent.indexOf("#FF8A00"), "Gold and amber colour references must be distinct.");
assert(mapComponent.includes("Gold = won / hot lead") && mapComponent.includes("Amber = follow-up / appointment"), "Legend must preserve useful gold/amber meanings.");

assert(mapComponent.includes("No mapped leads yet"), "Empty state must keep small no-data badge.");
assert(mapComponent.includes("Add property area or postal code to activate location intelligence."), "Empty state must keep small helper.");
assert(mapComponent.indexOf("<SingaporeSvgMap />") < mapComponent.indexOf("{mapStatusBadge ?"), "Map base and HQ must render before no-data helper labels.");
assert(!mapComponent.includes("Singapore Mission Map ready"), "Blocking empty-state title must not return.");
assert(!mapComponent.includes("left-1/2 top-1/2"), "Centered blocking overlay positioning must not return.");
assert(!/demo pin|sample pin|fake pin|fake map/i.test(mapComponent), "Map component must not include fake/demo map data.");

for (const field of [
  'version: "v6_4_3_singapore_map_zoom_hq_redesign"',
  'salesBrainVersion: "v6.4.3"',
  "singaporeMapWideLayoutAvailable",
  "singaporeMapZoomableAvailable",
  "singaporeMapPanAvailable",
  "singaporeMapResetZoomAvailable",
  "singaporeMapHqMarkerAvailable",
  "singaporeMapSentosaOnlyAvailable",
  "goldAmberColourSeparationFixed",
  "mapNoBlockingOverlayAvailable",
  "privacySafeMapDisplayAvailable",
  "externalGeocodingEnabled: false",
  "priceGuideOnHold: true",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled"
]) {
  assert(health.includes(field), `Health endpoint missing v6.4.3 proof field: ${field}`);
}

assert(commandCore.includes("CommandCoreMissionMap") && commandCore.includes("buildSingaporeMissionMapData"), "Command Core must still build and render the interactive map.");
assert(!mapComponent.includes("projectAddress") && !mapComponent.includes("project_address"), "Dashboard map must not render exact/full addresses.");
assert(!/fetch\(|googleapis|maps\.google|mapbox|geocode|GOOGLE_MAPS|MAPBOX|api[_-]?key/i.test(mapComponent + svgMapComponent + geoMapComponent), "No external geocoding or map API key should be added.");

assert(audit.includes("docs/V6_4_3_SINGAPORE_MAP_ZOOM_HQ_REDESIGN.md"), "Package audit must require v6.4.3 docs.");
assert(audit.includes("scripts/test_v6_4_3_singapore_map_zoom_hq_redesign.mjs"), "Package audit must require v6.4.3 test.");
assert(packageJson.includes('"test:v6.4.3"'), "package.json must expose v6.4.3 test script.");
assert(packageJson.includes("test:v6.4.3") && packageJson.includes("verify:all"), "verify:all must include the v6.4.3 test.");
assert(devBrain.includes("scripts/test_v6_4_3_singapore_map_zoom_hq_redesign.mjs"), "Dev Brain QA must run the v6.4.3 test.");
assert(docs.includes("v6_4_3_singapore_map_zoom_hq_redesign") && docs.includes("LIMM HQ") && docs.includes("Sentosa"), "v6.4.3 docs must explain zoom/HQ/Sentosa redesign.");

assert(clientFilesPage.includes("Real client storage") && clientFilesPage.includes("listAllLeadFiles"), "Client Files must use the later repository-backed real storage implementation.");
assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook must remain intact.");
for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `Known-good WhatsApp payload shape missing ${phrase}`);
}

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
  assert(!checkedSources.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden v6.4.3 safety regression found: ${forbidden}`);
}

console.log("PASS: v6.4.3 Singapore map zoom + HQ redesign checks passed.");
