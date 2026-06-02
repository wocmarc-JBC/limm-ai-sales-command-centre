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

function ringsFor(feature) {
  if (feature.geometry.type === "Polygon") return feature.geometry.coordinates;
  return feature.geometry.coordinates.flatMap((polygon) => polygon);
}

function pointInRing([lng, lat], ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [lng1, lat1] = ring[index];
    const [lng2, lat2] = ring[previous];
    const intersects = lat1 > lat !== lat2 > lat && lng < ((lng2 - lng1) * (lat - lat1)) / (lat2 - lat1) + lng1;
    if (intersects) inside = !inside;
  }
  return inside;
}

function featureContains(feature, point) {
  return ringsFor(feature).some((ring) => pointInRing(point, ring));
}

function ringArea(ring) {
  let total = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    total += x1 * y2 - x2 * y1;
  }
  return Math.abs(total / 2);
}

function ringCentroid(ring) {
  let twiceArea = 0;
  let centroidX = 0;
  let centroidY = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    centroidX += (x1 + x2) * cross;
    centroidY += (y1 + y2) * cross;
  }
  if (Math.abs(twiceArea) < 0.0000001) return ring[0];
  return [centroidX / (3 * twiceArea), centroidY / (3 * twiceArea)];
}

function featureCentroid(feature) {
  const ring = ringsFor(feature).reduce((largest, next) => (ringArea(next) > ringArea(largest) ? next : largest));
  return ringCentroid(ring);
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
    y: offsetY + (bounds.north - lat) * scale,
    offsetX,
    offsetY,
    projectedWidth,
    projectedHeight
  };
}

const officialAssetPath = "public/maps/singapore-planning-area-no-sea.geojson";
const displayedAssetPath = "public/maps/singapore.geojson";
const bundledAssetPath = "lib/singapore-map-data.json";
const officialAsset = json(officialAssetPath);
const displayedAsset = json(displayedAssetPath);
const bundledAsset = json(bundledAssetPath);
const geometry = read("lib/singapore-map-geometry.ts");
const geoMap = read("components/SingaporeGeoMap.tsx");
const missionMap = read("components/SingaporeMissionMap.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const packageJson = read("package.json");
const audit = read("scripts/audit_v3_package.mjs");
const devBrain = read("scripts/dev_brain_qa.mjs");

assert(officialAsset.type === "FeatureCollection", "Official planning-area asset must be a GeoJSON FeatureCollection.");
assert(displayedAsset.type === "FeatureCollection", "Dashboard map asset must be a GeoJSON FeatureCollection.");
assert(bundledAsset.type === "FeatureCollection", "Bundled map asset must be a GeoJSON FeatureCollection.");
assert(officialAsset.sourceDatasetId === "d_4765db0e87b9c86336792efe8a1f7a66", "Official asset must use the preferred data.gov.sg planning-area dataset id.");
assert(displayedAsset.sourceDatasetId === officialAsset.sourceDatasetId, "Displayed dashboard asset must be the official planning-area dataset.");
assert(bundledAsset.sourceDatasetId === officialAsset.sourceDatasetId, "Bundled dashboard asset must be the official planning-area dataset.");
assert(/data\.gov\.sg/i.test(officialAsset.source) && /URA/i.test(officialAsset.source), "Official asset source must identify data.gov.sg / URA.");
assert(/Singapore Open Data Licence/i.test(officialAsset.licence), "Official asset must record the Singapore Open Data Licence.");
assert(Array.isArray(officialAsset.features) && officialAsset.features.length >= 55, "Official planning-area asset must include the 55 planning-area features.");

for (const requiredArea of ["ORCHARD", "BUKIT TIMAH", "SERANGOON", "TAMPINES", "WOODLANDS", "DOWNTOWN CORE", "JURONG EAST", "MARINE PARADE"]) {
  assert(officialAsset.features.some((feature) => feature.properties?.name === requiredArea), `Official planning-area asset missing ${requiredArea}.`);
}

const allPositions = collectPositions(officialAsset.features.map((feature) => feature.geometry.coordinates));
assert(allPositions.length > 10000, `Official planning-area asset should have rich real geometry, got ${allPositions.length} coordinate points.`);
const bounds = {
  west: Math.min(...allPositions.map(([lng]) => lng)),
  east: Math.max(...allPositions.map(([lng]) => lng)),
  south: Math.min(...allPositions.map(([, lat]) => lat)),
  north: Math.max(...allPositions.map(([, lat]) => lat))
};
assert(bounds.west > 103.55 && bounds.east < 104.12, "Singapore longitude bounds should be realistic and not cropped.");
assert(bounds.south > 1.1 && bounds.north < 1.5, "Singapore latitude bounds should be realistic and not cropped.");

const viewBox = { width: 900, height: 560, padding: 28 };
const projectedPositions = allPositions.map(([lng, lat]) => project({ lat, lng }, bounds, viewBox));
const minX = Math.min(...projectedPositions.map((point) => point.x));
const maxX = Math.max(...projectedPositions.map((point) => point.x));
const minY = Math.min(...projectedPositions.map((point) => point.y));
const maxY = Math.max(...projectedPositions.map((point) => point.y));
assert(minX >= viewBox.padding - 0.5 && maxX <= viewBox.width - viewBox.padding + 0.5, "Map projection must fit longitude bounds inside the SVG padding.");
assert(minY >= viewBox.padding - 0.5 && maxY <= viewBox.height - viewBox.padding + 0.5, "Map projection must fit latitude bounds inside the SVG padding.");
assert(Math.abs((minX + maxX) / 2 - viewBox.width / 2) < 2, "Map must be centred horizontally.");
assert(Math.abs((minY + maxY) / 2 - viewBox.height / 2) < 2, "Map must be centred vertically.");

const hq = { lat: 1.3008, lng: 103.8375 };
const hqPoint = project(hq, bounds, viewBox);
assert(hqPoint.x > 395 && hqPoint.x < 475, `HQ marker should sit around Orchard / Dhoby Ghaut horizontally, got ${hqPoint.x.toFixed(1)}.`);
assert(hqPoint.y > 270 && hqPoint.y < 330, `HQ marker should sit on central main island, not below it, got ${hqPoint.y.toFixed(1)}.`);
const hqFeature = officialAsset.features.find((feature) => featureContains(feature, [hq.lng, hq.lat]));
assert(hqFeature, "HQ marker coordinate must be inside an official planning-area polygon.");
assert(!/sentosa|southern islands/i.test(hqFeature.properties?.name ?? ""), `HQ marker must not fall on Sentosa/Southern Islands, got ${hqFeature.properties?.name}.`);

const sentosaNamedFeatures = officialAsset.features.filter((feature) => /^sentosa$/i.test(feature.properties?.name ?? ""));
assert(sentosaNamedFeatures.length === 0, "Preferred official planning-area asset has no standalone Sentosa feature; code must not draw a fake one.");
const assetText = JSON.stringify(officialAsset) + JSON.stringify(displayedAsset) + JSON.stringify(bundledAsset);
assert(!/SG\.SENTOSA\.LOCAL|local dashboard-scale sentosa|Highcharts|Natural Earth/i.test(assetText), "Old local Sentosa / Highcharts / Natural Earth geometry must be removed.");
assert(!/ellipse|rounded-\[48%_52%_45%_55%]|singapore-visible-islands|SG\.SENTOSA\.LOCAL/i.test(geoMap + missionMap + geometry), "Fake Sentosa oval/blob/static island code must not exist.");

for (const label of [
  ["Orchard", "ORCHARD"],
  ["Bukit Timah", "BUKIT TIMAH"],
  ["Serangoon", "SERANGOON"],
  ["Tampines", "TAMPINES"],
  ["East Coast", "MARINE PARADE"],
  ["Jurong", "JURONG EAST"],
  ["Woodlands", "WOODLANDS"],
  ["CBD", "DOWNTOWN CORE"]
]) {
  const feature = officialAsset.features.find((candidate) => candidate.properties?.name === label[1]);
  assert(feature, `Label source polygon missing for ${label[0]}.`);
  const [lng, lat] = featureCentroid(feature);
  const point = project({ lat, lng }, bounds, viewBox);
  assert(point.x >= 0 && point.x <= viewBox.width && point.y >= 0 && point.y <= viewBox.height, `${label[0]} label centroid projects outside the map viewBox.`);
  assert(geometry.includes(label[0]) && geometry.includes(label[1]), `${label[0]} label must be tied to its official polygon source.`);
}

assert(geoMap.includes("data-official-planning-area-map") && geoMap.includes("data-map-fit=\"geojson-bounds\""), "GeoJSON renderer must expose official source and fit-to-bounds proof.");
assert(missionMap.includes("SINGAPORE_AREA_LABELS.filter") && missionMap.includes("data-planning-area"), "Mission map labels must render only bounded polygon-derived labels.");
assert(missionMap.includes("No mapped leads yet"), "Compact no-data badge must remain.");
assert(!missionMap.includes("Add property area or postal code to activate location intelligence."), "Large/helper empty-state copy must be removed from the map area.");
assert(missionMap.includes("data-testid=\"map-zoom-in\"") && missionMap.includes("data-testid=\"map-zoom-reset\""), "Zoom/reset controls must remain.");
assert(missionMap.includes("Gold = won / hot lead") && missionMap.includes("Amber = follow-up / appointment"), "Legend must remain.");
assert(!/fetch\(|googleapis|maps\.google|mapbox|geocode|GOOGLE_MAPS|MAPBOX|api[_-]?key/i.test(geoMap + missionMap + geometry), "No external map/geocoding dependency should be added.");

for (const field of [
  'version: "v6_4_6_official_singapore_planning_area_map"',
  'salesBrainVersion: "v6.4.6"',
  "officialSingaporePlanningAreaMapAvailable",
  "mapFitToBoundsAvailable: true",
  "mapCroppingFixed: true",
  "areaLabelsBoundedToPolygons: true",
  "hqMarkerCentralSingaporeAvailable: true",
  "fakeSentosaRemoved: true",
  "externalGeocodingEnabled: false",
  "priceGuideOnHold: true",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled: false"
]) {
  assert(health.includes(field), `Health endpoint missing v6.4.6 proof field: ${field}`);
}

assert(packageJson.includes("test_v6_4_6_official_singapore_planning_area_map.mjs"), "package.json must expose the v6.4.6 official planning-area test.");
assert(devBrain.includes("scripts/test_v6_4_6_official_singapore_planning_area_map.mjs"), "Dev Brain QA must include the v6.4.6 official planning-area test.");
assert(audit.includes("scripts/test_v6_4_6_official_singapore_planning_area_map.mjs"), "Package audit must require the v6.4.6 official planning-area test.");
assert(audit.includes("public/maps/singapore-planning-area-no-sea.geojson"), "Package audit must require the official planning-area asset.");

console.log("PASS: v6.4.6 official Singapore planning-area map fit checks passed.");
