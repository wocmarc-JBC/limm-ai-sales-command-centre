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
    y: offsetY + (bounds.north - lat) * scale,
    minX: offsetX,
    maxX: offsetX + projectedWidth,
    minY: offsetY,
    maxY: offsetY + projectedHeight,
    projectedWidth,
    projectedHeight
  };
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
const docs = read("docs/V6_4_9_SINGAPORE_MAP_SMOOTH_ZOOM_WHEEL_LOCK.md");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");

assert(officialAsset.sourceDatasetId === "d_4765db0e87b9c86336792efe8a1f7a66", "Official data.gov.sg / URA planning-area geometry must remain the source.");
assert(displayedAsset.sourceDatasetId === officialAsset.sourceDatasetId, "Rendered Singapore map must use the official local planning-area asset.");
assert(bundledAsset.sourceDatasetId === officialAsset.sourceDatasetId, "Bundled Singapore geometry must use the official local planning-area asset.");
assert(displayedAsset.features.length >= 55 && bundledAsset.features.length >= 55, "Official planning-area feature count must be preserved.");

for (const forbidden of [
  "M71 302 C82 284",
  "M58 313 L78 286",
  "data-outline-source=\"local-static-real-singapore-outline\"",
  "singapore-visible-islands",
  "rounded-[48%_52%_45%_55%]",
  "<ellipse",
  "SG.SENTOSA.LOCAL",
  "local dashboard-scale sentosa"
]) {
  assert(!missionMap.includes(forbidden) && !geoMap.includes(forbidden) && !geometry.includes(forbidden), `Fake/manual map shape returned: ${forbidden}`);
}

for (const required of [
  "const defaultZoom = 1",
  "const minZoom = 1",
  "const maxZoom = 4",
  "const zoomStep = 0.25",
  "const wheelZoomStep = 0.12",
  "function boundedZoom",
  "function boundedPan",
  "function resetMapView()",
  "setZoom(defaultZoom)",
  "setPan({ x: 0, y: 0 })",
  "setSelectedPin(null)",
  "setSelectedAreaName(\"\")",
  "setHqSelected(false)",
  "setDragStart(null)",
  "data-testid=\"map-zoom-in\"",
  "data-testid=\"map-zoom-out\"",
  "data-testid=\"map-zoom-reset\"",
  "data-testid=\"map-zoom-percent\"",
  "disabled={!canZoomOut}",
  "disabled={!canZoomIn}",
  "Math.round((zoom / defaultZoom) * 100)",
  "title=\"Zoom in\"",
  "title=\"Zoom out\"",
  "title=\"Reset map view\"",
  "data-testid=\"singapore-map-transform-layer\"",
  "transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`",
  "transform 160ms ease-out",
  "data-min-zoom={minZoom}",
  "data-max-zoom={maxZoom}",
  "data-zoom-step={zoomStep}"
]) {
  assert(missionMap.includes(required), `Smooth zoom/reset implementation missing: ${required}`);
}

for (const required of [
  "mapViewportRef",
  "addEventListener(\"wheel\", handleNativeWheel, { passive: false })",
  "event.preventDefault()",
  "event.stopPropagation()",
  "data-wheel-zoom=\"native-passive-false\"",
  "data-wheel-page-scroll-lock=\"true\"",
  "Scroll to zoom map"
]) {
  assert(missionMap.includes(required), `Wheel zoom/page-scroll lock missing: ${required}`);
}

assert(!missionMap.includes("onWheel={handleWheel}"), "Map wheel lock should use the non-passive native listener, not the old React-only wheel handler.");
assert(!/if\s*\(!event\.ctrlKey[\s\S]{0,120}return/.test(missionMap), "Wheel zoom must not skip normal wheel events and let the page scroll.");

for (const required of [
  "handlePointerDown",
  "handlePointerMove",
  "handlePointerEnd",
  "hasPointerCapture",
  "onPointerLeave={handlePointerEnd}",
  "dragMovedRef",
  "cursor-grab",
  "active:cursor-grabbing",
  "boundedPan"
]) {
  assert(missionMap.includes(required), `Pan/drag stability missing: ${required}`);
}

assert(geometry.includes("padding: 28"), "v6.4.9 must tighten projection padding for a larger fitted Singapore map.");
assert(geoMap.includes("h-[94%]") && geoMap.includes("w-full"), "Map SVG layer must use more of the available panel width/height.");
assert(missionMap.includes("data-default-fit-improved=\"true\"") && missionMap.includes("data-horizontal-space-optimized=\"true\""), "Map fit/stretch proof flags missing.");

const positions = collectPositions(displayedAsset.features.map((feature) => feature.geometry.coordinates));
const bounds = {
  west: Math.min(...positions.map(([lng]) => lng)),
  east: Math.max(...positions.map(([lng]) => lng)),
  south: Math.min(...positions.map(([, lat]) => lat)),
  north: Math.max(...positions.map(([, lat]) => lat))
};
const projectedBounds = project({ lat: bounds.north, lng: bounds.east }, bounds);
const mapWidthPercent = (projectedBounds.projectedWidth / 900) * 100;
assert(mapWidthPercent >= 80 && mapWidthPercent <= 90, `Singapore map should fill 80-90% of the viewBox width, got ${mapWidthPercent.toFixed(1)}%.`);
assert(projectedBounds.minX >= 27 && projectedBounds.maxX <= 873, "Map must not crop horizontally after the tighter fit.");
assert(projectedBounds.minY >= 27 && projectedBounds.maxY <= 533, "Map must not crop vertically after the tighter fit.");

const hqPoint = project({ lat: 1.3008, lng: 103.8375 }, bounds);
assert(hqPoint.x > 395 && hqPoint.x < 475, `HQ should project around Orchard / Dhoby Ghaut horizontally, got ${hqPoint.x.toFixed(1)}.`);
assert(hqPoint.y > 270 && hqPoint.y < 330, `HQ should project on central mainland, not below it, got ${hqPoint.y.toFixed(1)}.`);
assert(missionMap.includes("data-testid=\"limm-hq-marker\"") && missionMap.includes("data-testid=\"map-hq-tooltip\""), "HQ marker and tooltip must remain testable.");
assert(missionMap.includes("mission-map-pin") && missionMap.includes("selectPin(pin, event)") && missionMap.includes("data-testid={`map-pin-"), "Pins must remain clickable and aligned to projected coordinates.");

for (const label of ["Orchard / CBD", "Bukit Timah", "Serangong", "Tampines", "East Coast", "Jurong", "Woodlands"]) {
  const expected = label === "Serangong" ? "Serangoon" : label;
  assert(geometry.includes(expected), `Area label missing: ${expected}`);
}

for (const field of [
  'version: "v6_4_9_singapore_map_smooth_zoom_wheel_lock"',
  'salesBrainVersion: "v6.4.9"',
  "mapSmoothZoomControlsAvailable",
  "mapResetButtonFixed",
  "mapResetClearsPanSelectionTooltip",
  "mapWheelZoomAvailable",
  "mapWheelPreventsPageScroll",
  "mapWheelListenerPassiveFalse",
  "mapZoomBoundsAvailable",
  "mapZoomPercentAccurate",
  "mapPanDragAvailable",
  "mapDefaultFitImproved",
  "mapHorizontalSpaceOptimized",
  "officialMapGeometryPreserved",
  "privacySafeMapDisplayAvailable",
  "externalGeocodingEnabled: false",
  "priceGuideOnHold: true",
  "calendarAutoBookingEnabled: false",
  "voiceTranscriptionEnabled: false"
]) {
  assert(health.includes(field), `Health endpoint missing v6.4.9 proof field: ${field}`);
}

assert(packageJson.includes('"test:v6.4.9"') && packageJson.includes("test_v6_4_9_singapore_map_smooth_zoom_wheel_lock.mjs"), "package.json must expose v6.4.9 test.");
assert(devBrain.includes("scripts/test_v6_4_9_singapore_map_smooth_zoom_wheel_lock.mjs"), "Dev Brain QA must include v6.4.9 test.");
assert(audit.includes("scripts/test_v6_4_9_singapore_map_smooth_zoom_wheel_lock.mjs"), "Package audit must require v6.4.9 test.");
assert(audit.includes("docs/V6_4_9_SINGAPORE_MAP_SMOOTH_ZOOM_WHEEL_LOCK.md"), "Package audit must require v6.4.9 docs.");
assert(docs.includes("wheel") && docs.includes("prevent") && docs.includes("official"), "v6.4.9 docs must explain wheel lock and official geometry preservation.");

assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook must remain untouched.");
for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `Known-good WhatsApp payload shape missing ${phrase}.`);
}

const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";
const scannedSources = [missionMap, geoMap, geometry, health, whatsappRoute, whatsappAdapter].join("\n");
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
  assert(!scannedSources.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden v6.4.9 safety regression found: ${forbidden}`);
}

assert(!/fetch\(|googleapis|maps\.google|mapbox|geocode|GOOGLE_MAPS|MAPBOX|api[_-]?key/i.test(missionMap + geoMap + geometry), "No external map/geocoding dependency should be added.");
assert(!missionMap.includes("projectAddress") && !missionMap.includes("project_address"), "Dashboard map must remain privacy-safe and avoid full exact addresses.");

console.log("PASS: v6.4.9 Singapore map smooth zoom and wheel lock checks passed.");
