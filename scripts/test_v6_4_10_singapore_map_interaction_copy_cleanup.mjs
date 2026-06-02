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
const docs = read("docs/V6_4_10_SINGAPORE_MAP_INTERACTION_COPY_CLEANUP.md");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");

assert(officialAsset.sourceDatasetId === "d_4765db0e87b9c86336792efe8a1f7a66", "Official data.gov.sg / URA planning-area geometry must remain the source.");
assert(displayedAsset.sourceDatasetId === officialAsset.sourceDatasetId, "Rendered Singapore map must still use the official local planning-area asset.");
assert(bundledAsset.sourceDatasetId === officialAsset.sourceDatasetId, "Bundled Singapore geometry must still use the official local planning-area asset.");
assert(displayedAsset.features.length >= 55 && bundledAsset.features.length >= 55, "Official planning-area feature count must be preserved.");

for (const required of [
  "const defaultZoom = 1",
  "const minZoom = 1",
  "const maxZoom = 4",
  "const zoomStep = 0.25",
  "const wheelZoomStep = 0.12",
  "function resetMapView()",
  "setZoom(defaultZoom)",
  "setPan({ x: 0, y: 0 })",
  "setSelectedPin(null)",
  "setSelectedAreaName(\"\")",
  "setHqSelected(false)",
  "setDragStart(null)",
  "data-default-zoom-starts-at-100=\"true\"",
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
  "transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`",
  "transform 160ms ease-out"
]) {
  assert(missionMap.includes(required), `Map zoom/reset requirement missing: ${required}`);
}

for (const required of [
  "mapViewportRef",
  "addEventListener(\"wheel\", handleNativeWheel, { passive: false })",
  "event.preventDefault()",
  "event.stopPropagation()",
  "data-wheel-page-scroll-lock=\"true\"",
  "data-wheel-zoom=\"native-passive-false\""
]) {
  assert(missionMap.includes(required), `Wheel page-scroll lock missing: ${required}`);
}

assert(!missionMap.includes("onWheel={handleWheel}"), "Map should not rely on the old React-only wheel handler.");
assert(!/if\s*\(!event\.ctrlKey[\s\S]{0,120}return/.test(missionMap), "Wheel handler must not let ordinary wheel events scroll the page.");

for (const required of [
  "handlePointerDown",
  "handlePointerMove",
  "handlePointerEnd",
  "boundedPan",
  "dragMovedRef",
  "hasPointerCapture",
  "onPointerLeave={handlePointerEnd}",
  "cursor-grab",
  "active:cursor-grabbing"
]) {
  assert(missionMap.includes(required), `Pan/drag polish missing: ${required}`);
}

for (const required of [
  "const genericFilterEmptyStateText = \"No mapped items for this filter.\"",
  "const filterEmptyStateLabels",
  "showFilterEmptyState",
  "const mapStatusBadge",
  "data-testid=\"map-status-badge\"",
  "data-top-left-map-status-badge=\"single\"",
  "data-map-top-left-copy-deduped=\"true\"",
  "data-map-no-stacked-status-labels=\"true\"",
  "No mapped leads yet",
  "No mapped follow-ups yet",
  "No mapped hot leads yet",
  "No mapped appointments yet",
  "No mapped risks yet"
]) {
  assert(missionMap.includes(required), `Top-left status/copy cleanup missing: ${required}`);
}

const statusBadgeOccurrences = (missionMap.match(/data-testid="map-status-badge"/g) ?? []).length;
assert(statusBadgeOccurrences === 1, `There must be exactly one top-left status badge component, got ${statusBadgeOccurrences}.`);
assert(!missionMap.includes("absolute left-3 top-14"), "Old second stacked top-left filter badge must be removed.");
assert(!missionMap.includes("{activeFilter !== \"all\" && !hasFilteredMapData ?"), "Filter empty copy should use the single computed status badge.");

assert(missionMap.includes("data-testid=\"map-location-helper\""), "Helper copy should be moved below the map.");
assert(missionMap.includes("data-map-helper-text-position=\"below-map\""), "Map must prove helper text moved away from top-left.");
assert(missionMap.includes("Add property area or postal code to activate location intelligence."), "New subtle location helper copy missing.");
assert(!missionMap.includes("Area-level only. Add area or postal details to place live work."), "Old top-left helper copy should not remain.");
assert(!missionMap.includes("Singapore Mission Map ready") && !missionMap.includes("left-1/2 top-1/2"), "Large blocking empty overlay must not return.");

for (const required of [
  "data-testid=\"map-area-summary-panel\"",
  "data-testid=\"map-inspector-pin\"",
  "data-testid=\"map-inspector-hq\"",
  "Click a zone or pin to inspect area activity.",
  "Postal: 228397",
  "Office base marker only. Not a lead pin.",
  "Open item",
  "View leads in area"
]) {
  assert(missionMap.includes(required), `Inspector/click feedback missing: ${required}`);
}

for (const required of [
  "map-hq-marker-compact",
  "data-hq-marker-scale-polished=\"true\"",
  "h-8 w-8",
  "h-3 w-3",
  "text-[0.58rem]"
]) {
  assert(missionMap.includes(required), `HQ marker scale polish missing: ${required}`);
}

for (const required of [
  "displayedAreaSummaries",
  "activeFilter === \"all\"",
  "visiblePinAreas.has(area.area)",
  "filter.key === activeFilter",
  "border-[#FFD54A] bg-[#FFD54A] text-black"
]) {
  assert(missionMap.includes(required), `Filter visible state missing: ${required}`);
}

for (const field of [
  'version: "v6_4_10_singapore_map_interaction_copy_cleanup"',
  'salesBrainVersion: "v6.4.10"',
  "mapDefaultZoomStartsAt100",
  "mapResetButtonFixed",
  "mapResetRestoresDefaultFit",
  "mapResetClearsSelection",
  "mapSmoothZoomControlsAvailable",
  "mapWheelPreventsPageScroll",
  "mapPanDragAvailable",
  "mapFilterEmptyStatePolished",
  "mapTopLeftCopyDeduped",
  "mapHelperTextMovedToBottom",
  "mapNoStackedStatusLabels",
  "mapInspectorPanelAvailable",
  "mapFiltersAffectPinsAvailable",
  "mapHqMarkerScalePolished",
  "officialMapGeometryPreserved",
  "privacySafeMapDisplayAvailable",
  "externalGeocodingEnabled: false",
  "priceGuideOnHold: true",
  "calendarAutoBookingEnabled: false",
  "voiceTranscriptionEnabled: false"
]) {
  assert(health.includes(field), `Health endpoint missing v6.4.10 proof field: ${field}`);
}

assert(packageJson.includes('"test:v6.4.10"') && packageJson.includes("test_v6_4_10_singapore_map_interaction_copy_cleanup.mjs"), "package.json must expose v6.4.10 test.");
assert(devBrain.includes("scripts/test_v6_4_10_singapore_map_interaction_copy_cleanup.mjs"), "Dev Brain QA must include v6.4.10 test.");
assert(audit.includes("scripts/test_v6_4_10_singapore_map_interaction_copy_cleanup.mjs"), "Package audit must require v6.4.10 test.");
assert(audit.includes("docs/V6_4_10_SINGAPORE_MAP_INTERACTION_COPY_CLEANUP.md"), "Package audit must require v6.4.10 docs.");
assert(docs.includes("default zoom remains 100%") && docs.includes("top-left") && docs.includes("wheel"), "v6.4.10 docs must explain default zoom, copy cleanup and wheel lock.");

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

assert(geoMap.includes("data-official-planning-area-map") && geoMap.includes("data-map-fit=\"geojson-bounds\""), "Official map geometry proof must remain.");
assert(!/fetch\(|googleapis|maps\.google|mapbox|geocode|GOOGLE_MAPS|MAPBOX|api[_-]?key/i.test(missionMap + geoMap + geometry), "No external map/geocoding dependency should be added.");
assert(!missionMap.includes("projectAddress") && !missionMap.includes("project_address"), "Dashboard map must remain privacy-safe and avoid full exact addresses.");

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
  assert(!scannedSources.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden v6.4.10 safety regression found: ${forbidden}`);
}

console.log("PASS: v6.4.10 Singapore map interaction and copy cleanup checks passed.");
