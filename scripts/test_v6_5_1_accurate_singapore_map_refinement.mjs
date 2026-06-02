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

function numberFrom(pattern, content, label) {
  const match = content.match(pattern);
  assert(match, `Could not parse ${label}.`);
  return Number(match[1]);
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

function project({ lat, lng }, bounds, viewBox = { width: 900, height: 520, padding: 34 }) {
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

const svgMap = read("components/SingaporeSvgMap.tsx");
const geoMap = read("components/SingaporeGeoMap.tsx");
const missionMap = read("components/SingaporeMissionMap.tsx");
const geometry = read("lib/singapore-map-geometry.ts");
const asset = json("public/maps/singapore.geojson");
const health = read("app/api/whatsapp/health/route.ts");
const packageJson = read("package.json");
const devBrain = read("scripts/dev_brain_qa.mjs");
const audit = read("scripts/audit_v3_package.mjs");

assert(svgMap.includes("SingaporeGeoMap"), "Map wrapper must use the real GeoJSON renderer.");
assert(geoMap.includes("data-map-source=\"/maps/singapore.geojson\""), "Map must use the local real Singapore GeoJSON source marker.");
assert(geoMap.includes("real-singapore-outline"), "Real Singapore outline class must exist.");
assert(!geoMap.includes("M58 313 L78 286"), "Old hand-tuned mainland path must not return.");
assert(geometry.includes("buildSingaporeGeoPaths"), "New map path must be generated from GeoJSON geometry.");
assert(geoMap.includes("data-testid=\"sentosa-outline\""), "Sentosa outline must be testable.");
assert(!/ellipse|rounded-\[48%_52%_45%_55%]/i.test(svgMap + geoMap + missionMap), "Map must not use oval/blob placeholders.");

const positions = collectPositions(asset.features.map((feature) => feature.geometry.coordinates));
const bounds = {
  west: Math.min(...positions.map(([lng]) => lng)),
  east: Math.max(...positions.map(([lng]) => lng)),
  south: Math.min(...positions.map(([, lat]) => lat)),
  north: Math.max(...positions.map(([, lat]) => lat))
};
const sentosa = asset.features.find((feature) => /Sentosa/i.test(feature.properties?.name ?? ""));
assert(sentosa, "Sentosa feature must exist in the real GeoJSON asset.");
const sentosaPositions = collectPositions(sentosa.geometry.coordinates);
const sentosaBounds = {
  west: Math.min(...sentosaPositions.map(([lng]) => lng)),
  east: Math.max(...sentosaPositions.map(([lng]) => lng)),
  south: Math.min(...sentosaPositions.map(([, lat]) => lat)),
  north: Math.max(...sentosaPositions.map(([, lat]) => lat))
};
const sentosaWidth = sentosaBounds.east - sentosaBounds.west;
const sentosaHeight = sentosaBounds.north - sentosaBounds.south;
assert(sentosaWidth > sentosaHeight * 1.5, "Sentosa should be a slim island shape, not a round oval.");
assert(sentosaWidth < (bounds.east - bounds.west) * 0.14, "Sentosa is oversized against the main Singapore map.");

const hqLat = numberFrom(/lat:\s*([0-9.]+)/, geometry, "HQ lat");
const hqLng = numberFrom(/lng:\s*([0-9.]+)/, geometry, "HQ lng");
const hqPoint = project({ lat: hqLat, lng: hqLng }, bounds);
assert(hqPoint.x >= 420 && hqPoint.x <= 560, `HQ marker should sit around central Singapore horizontally, got ${hqPoint.x.toFixed(2)}.`);
assert(hqPoint.y >= 315 && hqPoint.y <= 395, `HQ marker should sit around Orchard/Dhoby Ghaut, not below island, got ${hqPoint.y.toFixed(2)}.`);
assert(hqPoint.y < 405, "HQ marker must not project below the central mainland.");

for (const label of ["Orchard", "Bukit Timah", "Serangoon", "Tampines", "East Coast", "Jurong", "Woodlands", "CBD"]) {
  assert(geometry.includes(label), `Missing faint area label: ${label}`);
}

assert(missionMap.includes("data-testid={`map-area-label-"), "Area labels must be rendered with test ids.");
assert(!missionMap.includes("max-w-[17rem] rounded-xl border border-command-cyan/20"), "Large helper box must be removed from the map area.");
assert(missionMap.includes("Add property area or postal code to activate location intelligence."), "Small subtle helper text must remain.");
assert(missionMap.includes("data-testid=\"map-zoom-in\"") && missionMap.includes("data-testid=\"map-zoom-reset\""), "Zoom controls must remain.");
assert(missionMap.includes("Gold = won / hot lead") && missionMap.includes("Amber = follow-up / appointment"), "Map legend must remain.");
assert(!/fetch\(|googleapis|maps\.google|mapbox|geocode|GOOGLE_MAPS|MAPBOX|api[_-]?key/i.test(svgMap + geoMap + geometry + missionMap), "No external map/geocoding API should be added.");

for (const field of [
  'version: "v6_5_1_accurate_singapore_map_refinement"',
  'salesBrainVersion: "v6.5.1"',
  "realSingaporeOutlineAvailable: true",
  "hqMarkerCentralSingaporeCalibrated: true",
  "sentosaScaledShapeRefined: true",
  "mapAreaLabelsAvailable: true",
  "largeMapHelperBoxRemoved: true",
  "privacySafeMapDisplayAvailable",
  "externalGeocodingEnabled: false"
]) {
  assert(health.includes(field), `Health endpoint missing v6.5.1 proof field: ${field}`);
}

assert(packageJson.includes('"test:v6.5.1"'), "package.json must expose v6.5.1 test.");
assert(devBrain.includes("scripts/test_v6_5_1_accurate_singapore_map_refinement.mjs"), "Dev Brain QA must include v6.5.1 test.");
assert(audit.includes("scripts/test_v6_5_1_accurate_singapore_map_refinement.mjs"), "Package audit must require v6.5.1 test.");

const checkedSources = [svgMap, geoMap, geometry, missionMap, health].join("\n").toLowerCase();
for (const forbidden of [
  "115395" + "2887800145",
  "free consultation",
  "price range",
  "package price",
  "appointment confirmed",
  "booked for you"
]) {
  assert(!checkedSources.includes(forbidden.toLowerCase()), `Forbidden safety regression found: ${forbidden}`);
}

console.log("PASS: v6.5.1 accurate Singapore map refinement checks passed.");
