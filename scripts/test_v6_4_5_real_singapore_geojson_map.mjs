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

function collectPositions(value, positions = []) {
  if (Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    positions.push(value);
    return positions;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPositions(item, positions);
  }
  return positions;
}

function project({ lat, lng }, bounds, viewBox = { width: 900, height: 560, padding: 28 }) {
  const geoWidth = bounds.east - bounds.west;
  const geoHeight = bounds.north - bounds.south;
  const scale = Math.min((viewBox.width - viewBox.padding * 2) / geoWidth, (viewBox.height - viewBox.padding * 2) / geoHeight);
  const projectedWidth = geoWidth * scale;
  const projectedHeight = geoHeight * scale;
  const offsetX = (viewBox.width - projectedWidth) / 2;
  const offsetY = (viewBox.height - projectedHeight) / 2;
  return {
    x: offsetX + (lng - bounds.west) * scale,
    y: offsetY + (bounds.north - lat) * scale
  };
}

const assetPath = "public/maps/singapore.geojson";
const asset = json(assetPath);
const officialAsset = json("public/maps/singapore-planning-area-no-sea.geojson");
const missionMap = read("components/SingaporeMissionMap.tsx");
const svgMap = read("components/SingaporeSvgMap.tsx");
const geoMap = read("components/SingaporeGeoMap.tsx");
const geometry = read("lib/singapore-map-geometry.ts");
const health = read("app/api/whatsapp/health/route.ts");
const packageJson = read("package.json");
const devBrain = read("scripts/dev_brain_qa.mjs");
const audit = read("scripts/audit_v3_package.mjs");
const dashboard = read("app/page.tsx");
const clientFilesPage = read("app/client-files/page.tsx");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");

assert(asset.type === "FeatureCollection", "Singapore map asset must be a GeoJSON FeatureCollection.");
assert(asset.sourceDatasetId === "d_4765db0e87b9c86336792efe8a1f7a66", "Singapore map asset must use the official URA/data.gov.sg planning-area dataset.");
assert(asset.source?.includes("data.gov.sg") && asset.source?.includes("URA"), "Singapore map asset must record the official data.gov.sg / URA source.");
assert(asset.licence === "Singapore Open Data Licence", "Singapore map asset must record the Singapore Open Data Licence.");
assert(Array.isArray(asset.features) && asset.features.length >= 55, "Singapore map asset must include official planning-area features.");
assert(JSON.stringify(asset).length === JSON.stringify(officialAsset).length, "Dashboard map asset must mirror the committed official planning-area asset.");

const positions = collectPositions(asset.features.map((feature) => feature.geometry.coordinates));
assert(positions.length > 10000, `GeoJSON should contain official planning-area coordinate detail, got ${positions.length}.`);
const bounds = {
  west: Math.min(...positions.map(([lng]) => lng)),
  east: Math.max(...positions.map(([lng]) => lng)),
  south: Math.min(...positions.map(([, lat]) => lat)),
  north: Math.max(...positions.map(([, lat]) => lat))
};
assert(bounds.west >= 103.55 && bounds.east <= 104.12, "Singapore longitude bounds should be realistic.");
assert(bounds.south <= 1.17 && bounds.north >= 1.46, "Singapore latitude bounds should include official planning-area extent.");

const hq = { lat: 1.3008, lng: 103.8375 };
assert(hq.lng > bounds.west && hq.lng < bounds.east && hq.lat > bounds.south && hq.lat < bounds.north, "HQ coordinate must be inside Singapore map bounds.");
const hqPoint = project(hq, bounds);
assert(hqPoint.x > 395 && hqPoint.x < 475, `HQ should project around Orchard/Dhoby Ghaut horizontally, got ${hqPoint.x.toFixed(1)}.`);
assert(hqPoint.y > 270 && hqPoint.y < 330, `HQ should project on central mainland, not below the island, got ${hqPoint.y.toFixed(1)}.`);

for (const source of [svgMap, geoMap, missionMap]) {
  assert(!source.includes("M71 302 C82 284"), "Old hand-drawn v6.5.1 mainland path must be removed.");
  assert(!source.includes("M58 313 L78 286"), "Old v6.4.2 hand-drawn mainland path must be removed.");
  assert(!source.includes("data-outline-source=\"local-static-real-singapore-outline\""), "Old static-outline source marker must be removed.");
  assert(!/ellipse|rounded-\[48%_52%_45%_55%]|singapore-visible-islands/i.test(source), "Blob/oval/extra island placeholders must not return.");
}

assert(!/Highcharts|Natural Earth|SG\.SENTOSA\.LOCAL|local dashboard-scale sentosa/i.test(JSON.stringify(asset)), "Old non-official/local Sentosa geometry must be removed.");
assert(svgMap.includes("SingaporeGeoMap"), "Legacy SingaporeSvgMap wrapper should delegate to the real GeoJSON map renderer.");
assert(geoMap.includes("buildSingaporeGeoPaths") && geoMap.includes("data-map-source=\"/maps/singapore.geojson\""), "GeoJSON renderer must build SVG paths from the local asset.");
assert(geoMap.includes("data-official-planning-area-map") && geoMap.includes("data-map-fit=\"geojson-bounds\""), "GeoJSON renderer must expose official planning-area fit proof.");
assert(geometry.includes("projectSingaporeCoordinate") && geometry.includes("SINGAPORE_MAP_VIEWBOX"), "Geometry helper must project real coordinates into SVG space.");
assert(missionMap.includes("projectSingaporeCoordinate") && missionMap.includes("LIMM_HQ_COORDINATE"), "Mission map pins and HQ must use the real map projection.");
assert(missionMap.includes("title: \"LIMM Works HQ / Postal: 228397\""), "HQ tooltip must show LIMM Works HQ / Postal: 228397.");
assert(missionMap.includes("data-testid=\"limm-hq-marker\""), "HQ marker must remain visible and testable.");

for (const label of ["Orchard", "Bukit Timah", "Serangoon", "Tampines", "East Coast", "Jurong", "Woodlands", "CBD"]) {
  assert(geometry.includes(label) && missionMap.includes("SINGAPORE_AREA_LABELS.filter"), `Faint planning-area label missing: ${label}`);
}

assert(missionMap.includes("No mapped leads yet"), "Small no-data badge must remain.");
assert(!missionMap.includes("Singapore Mission Map ready"), "Blocking map overlay title must not return.");
assert(!missionMap.includes("left-1/2 top-1/2"), "Large centered blocking overlay must not return.");
assert(missionMap.includes("data-testid=\"map-zoom-in\"") && missionMap.includes("data-testid=\"map-zoom-reset\""), "Zoom/reset controls must remain.");
assert(missionMap.includes("Gold = won / hot lead") && missionMap.includes("Amber = follow-up / appointment"), "Legend must remain.");
assert(dashboard.includes("SingaporeMissionMap") && dashboard.includes("selectedArea={selectedMapArea}"), "Dashboard must still render selected-area map support.");

assert(!/fetch\(|googleapis|maps\.google|mapbox|geocode|GOOGLE_MAPS|MAPBOX|api[_-]?key/i.test(svgMap + geoMap + missionMap + geometry), "No external map/geocoding API should be added.");
assert(!missionMap.includes("projectAddress") && !missionMap.includes("project_address"), "Dashboard map must remain privacy-safe and avoid full addresses.");
assert(clientFilesPage.includes("Coming Soon") || clientFilesPage.includes("coming soon") || clientFilesPage.includes("not enabled"), "Client Files must remain Coming Soon / not live.");

for (const field of [
  'version: "v6_4_6_official_singapore_planning_area_map"',
  'salesBrainVersion: "v6.4.6"',
  "officialSingaporePlanningAreaMapAvailable",
  "realSingaporeGeojsonMapAvailable",
  "realMapGeometryAssetAvailable",
  "manualBlobMapRemoved",
  "hqMarkerPostal228397Available",
  "hqMarkerCentralSingaporeAvailable",
  "mapNoBlockingOverlayAvailable",
  "mapBaseAlwaysVisible",
  "singaporeMapZoomableAvailable",
  "singaporeMapPanAvailable",
  "singaporeMapResetZoomAvailable",
  "goldAmberColourSeparationFixed",
  "privacySafeMapDisplayAvailable",
  "externalGeocodingEnabled: false",
  "googleMapsEnabled: false",
  "priceGuideOnHold: true",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled: false"
]) {
  assert(health.includes(field), `Health endpoint missing real GeoJSON proof field: ${field}`);
}

assert(packageJson.includes('"test:v6.4.5"') && packageJson.includes("test_v6_4_5_real_singapore_geojson_map.mjs"), "package.json must expose v6.4.5 test script.");
assert(devBrain.includes("scripts/test_v6_4_5_real_singapore_geojson_map.mjs"), "Dev Brain QA must include v6.4.5 test.");
assert(audit.includes("public/maps/singapore.geojson"), "Package audit must require the local real map asset.");
assert(audit.includes("scripts/test_v6_4_5_real_singapore_geojson_map.mjs"), "Package audit must require v6.4.5 test.");

assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook must remain intact.");
for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `Known-good WhatsApp payload shape missing ${phrase}`);
}

const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";
const scannedSources = [assetPath, svgMap, geoMap, geometry, missionMap, dashboard, health, whatsappRoute, whatsappAdapter].join("\n");
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
  assert(!scannedSources.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden v6.4.5 safety regression found: ${forbidden}`);
}

console.log("PASS: v6.4.5 real Singapore GeoJSON map checks passed.");
