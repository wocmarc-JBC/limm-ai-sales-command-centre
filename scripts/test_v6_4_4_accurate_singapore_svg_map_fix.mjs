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

const missionMapComponent = read("components/SingaporeMissionMap.tsx");
const svgMapComponent = read("components/SingaporeSvgMap.tsx");
const geoMapComponent = read("components/SingaporeGeoMap.tsx");
const geometry = read("lib/singapore-map-geometry.ts");
const dashboard = read("app/page.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const audit = read("scripts/audit_v3_package.mjs");
const packageJson = read("package.json");
const docs = read("docs/V6_4_4_ACCURATE_SINGAPORE_SVG_MAP_FIX.md");
const devBrain = read("scripts/dev_brain_qa.mjs");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");

assert(svgMapComponent.includes("export function SingaporeSvgMap"), "Accurate Singapore SVG component must exist.");
assert(missionMapComponent.includes("SingaporeSvgMap"), "Mission map must use the SingaporeSvgMap component.");
assert(svgMapComponent.includes("SingaporeGeoMap"), "Legacy wrapper must delegate to the real GeoJSON map renderer.");
assert(geoMapComponent.includes("singapore-map-svg"), "SVG map class must exist.");
assert(geoMapComponent.includes("singapore-mainland"), "Main island must render with class singapore-mainland.");
assert(geoMapComponent.includes("singapore-sentosa"), "Sentosa must render with class singapore-sentosa.");
assert((geoMapComponent.match(/singapore-sentosa/g) ?? []).length >= 1, "Sentosa island class should be rendered by the GeoJSON map.");
assert(!geoMapComponent.includes("singapore-visible-islands"), "Old extra-island cluster must not return.");
assert(!geoMapComponent.includes("sentosa-island singapore-sentosa-only"), "Oversized old Sentosa path must be removed.");
assert(geoMapComponent.includes("data-map-source=\"/maps/singapore.geojson\""), "Singapore mainland should use the local real GeoJSON source marker.");
assert(geometry.includes("buildSingaporeGeoPaths"), "Singapore mainland should be generated from the real GeoJSON path builder.");
assert(geometry.includes("SINGAPORE_AREA_LABELS"), "Real-coordinate area labels must come from the geometry helper.");
assert(!/ellipse|<circle[^>]+className=\"singapore-island-silhouette\"|rounded-\[48%_52%_45%_55%]/i.test(svgMapComponent + geoMapComponent + missionMapComponent), "Generic blob/oval/ellipse placeholder must be gone.");

assert(missionMapComponent.includes("singapore-hq-marker") && missionMapComponent.includes("limm-hq-marker"), "HQ marker class must exist.");
assert(missionMapComponent.includes("LIMM HQ"), "HQ marker label must include LIMM HQ.");
assert(missionMapComponent.includes("Postal: 228397"), "HQ tooltip must include postal 228397.");
assert(geometry.includes("lat: 1.3008") && geometry.includes("lng: 103.8375"), "HQ marker must be positioned on the central Orchard/Dhoby Ghaut main island area.");
assert(missionMapComponent.includes("projectSingaporeCoordinate"), "Real map projection helper must keep pins aligned to the island body.");
assert(missionMapComponent.includes("<button") && missionMapComponent.includes("data-testid=\"limm-hq-marker\""), "HQ marker should be a clickable marker/control.");

for (const phrase of [
  "const [zoom, setZoom]",
  "const [pan, setPan]",
  "boundedZoom",
  "boundedPan",
  "onWheel={handleWheel}",
  "onPointerDown={handlePointerDown}",
  "onPointerMove={handlePointerMove}",
  "data-testid=\"map-zoom-in\"",
  "data-testid=\"map-zoom-out\"",
  "data-testid=\"map-zoom-reset\"",
  "Reset"
]) {
  assert(missionMapComponent.includes(phrase), `Zoom/pan/reset support missing ${phrase}`);
}

assert(missionMapComponent.includes("No mapped leads yet"), "Small no-data badge must exist.");
assert(missionMapComponent.includes("Add property area or postal code to activate location intelligence."), "Small helper must exist.");
assert(!missionMapComponent.includes("max-w-[17rem] rounded-xl border border-command-cyan/20"), "Large helper box must not return.");
assert(missionMapComponent.indexOf("<SingaporeSvgMap />") < missionMapComponent.indexOf("{!hasMapData ?"), "Map base must render before no-data helper labels.");
assert(!missionMapComponent.includes("Singapore Mission Map ready"), "Blocking empty-state title must not return.");
assert(!missionMapComponent.includes("left-1/2 top-1/2"), "Large centered blocking overlay must not return.");

assert(missionMapComponent.includes("#FFD54A"), "Gold colour #FFD54A must be present.");
assert(missionMapComponent.includes("#FF8A00"), "Amber colour #FF8A00 must be present.");
assert(missionMapComponent.includes("#FF9F1A"), "Amber text #FF9F1A must be present.");
assert(missionMapComponent.includes("Gold = won / hot lead"), "Gold legend label must exist.");
assert(missionMapComponent.includes("Amber = follow-up / appointment"), "Amber legend label must exist.");
assert(missionMapComponent.indexOf("#FFD54A") !== missionMapComponent.indexOf("#FF8A00"), "Gold and amber colours must be distinct.");

assert(missionMapComponent.includes("data.areaSummaries.map"), "Area heatmap summaries must remain.");
assert(missionMapComponent.includes("data.pins.map"), "Clickable pins must remain.");
assert(missionMapComponent.includes("href={pin.href || \"#\"}"), "Pins must remain clickable.");
assert(missionMapComponent.includes("areaSelectHref(activeFilter, area.area)"), "Area zones must remain clickable/selectable.");
assert(dashboard.includes("SingaporeMissionMap") && dashboard.includes("selectedArea={selectedMapArea}"), "Dashboard must still render selected-area map support.");

assert(!missionMapComponent.includes("projectAddress") && !missionMapComponent.includes("project_address"), "Dashboard map must not render full project/client address fields.");
assert(!/fetch\(|googleapis|maps\.google|mapbox|geocode|GOOGLE_MAPS|MAPBOX|api[_-]?key/i.test(missionMapComponent + svgMapComponent + geoMapComponent + geometry), "No external geocoding or map API key should be added.");
assert(!/demo pin|sample pin|fake pin|fake map/i.test(missionMapComponent + svgMapComponent), "Map component must not include fake/demo map data.");

for (const field of [
  'version: "v6_4_4_accurate_singapore_svg_map_fix"',
  'salesBrainVersion: "v6.4.4"',
  "accurateSingaporeSvgMapAvailable",
  "singaporeMainlandSvgAvailable",
  "sentosaOnlyIslandAvailable",
  "singaporeMapZoomableAvailable",
  "singaporeMapPanAvailable",
  "singaporeMapResetZoomAvailable",
  "singaporeMapHqMarkerAvailable",
  'singaporeMapHqPostalCode: "228397"',
  "goldAmberColourSeparationFixed",
  "mapNoBlockingOverlayAvailable",
  "mapBaseAlwaysVisible",
  "privacySafeMapDisplayAvailable",
  "externalGeocodingEnabled: false",
  "priceGuideOnHold: true",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled"
]) {
  assert(health.includes(field), `Health endpoint missing v6.4.4 proof field: ${field}`);
}

assert(audit.includes("components/SingaporeSvgMap.tsx"), "Package audit must require SingaporeSvgMap.");
assert(audit.includes("docs/V6_4_4_ACCURATE_SINGAPORE_SVG_MAP_FIX.md"), "Package audit must require v6.4.4 docs.");
assert(audit.includes("scripts/test_v6_4_4_accurate_singapore_svg_map_fix.mjs"), "Package audit must require v6.4.4 test.");
assert(packageJson.includes('"test:v6.4.4"'), "package.json must expose v6.4.4 test script.");
assert(packageJson.includes("test:v6.4.4") && packageJson.includes("verify:all"), "verify:all must include the v6.4.4 test.");
assert(devBrain.includes("scripts/test_v6_4_4_accurate_singapore_svg_map_fix.mjs"), "Dev Brain QA must run the v6.4.4 test.");
assert(docs.includes("v6_4_4_accurate_singapore_svg_map_fix") && docs.includes("Sentosa") && docs.includes("228397"), "v6.4.4 docs must explain the SVG/Sentosa/HQ fix.");

assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook must remain intact.");
for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `Known-good WhatsApp payload shape missing ${phrase}`);
}

const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";
const checkedSources = [missionMapComponent, svgMapComponent, geoMapComponent, geometry, dashboard, health, docs, whatsappRoute, whatsappAdapter].join("\n");
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
  assert(!checkedSources.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden v6.4.4 safety regression found: ${forbidden}`);
}

console.log("PASS: v6.4.4 accurate Singapore SVG map fix checks passed.");
