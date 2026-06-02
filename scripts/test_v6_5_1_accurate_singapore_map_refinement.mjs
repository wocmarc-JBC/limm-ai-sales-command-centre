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

function numberFrom(pattern, content, label) {
  const match = content.match(pattern);
  assert(match, `Could not parse ${label}.`);
  return Number(match[1]);
}

const svgMap = read("components/SingaporeSvgMap.tsx");
const missionMap = read("components/SingaporeMissionMap.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const packageJson = read("package.json");
const devBrain = read("scripts/dev_brain_qa.mjs");
const audit = read("scripts/audit_v3_package.mjs");

assert(svgMap.includes("data-outline-source=\"local-static-real-singapore-outline\""), "Map must use the local static real-outline source marker.");
assert(svgMap.includes("real-singapore-outline"), "Real Singapore outline class must exist.");
assert(!svgMap.includes("M58 313 L78 286"), "Old hand-tuned mainland path must not return.");
assert(svgMap.includes("M71 302 C82 284"), "New more accurate mainland SVG path must exist.");
assert(svgMap.includes("data-testid=\"sentosa-outline\""), "Sentosa outline must be testable.");

const sentosaBounds = svgMap.match(/data-map-bounds="(\d+),(\d+),(\d+),(\d+)"/);
assert(sentosaBounds, "Sentosa map bounds must be declared for regression testing.");
const [, sx1, sy1, sx2, sy2] = sentosaBounds.map(Number);
const sentosaWidth = sx2 - sx1;
const sentosaHeight = sy2 - sy1;
assert(sentosaWidth <= 110, `Sentosa is oversized: width ${sentosaWidth}.`);
assert(sentosaHeight <= 28, `Sentosa is oversized: height ${sentosaHeight}.`);
assert(sentosaWidth / sentosaHeight >= 3.5, "Sentosa should be a slim island shape, not a round oval.");
assert(!/ellipse|rounded-\[48%_52%_45%_55%]/i.test(svgMap + missionMap), "Map must not use oval/blob placeholders.");

const north = numberFrom(/north:\s*([0-9.]+)/, missionMap, "north bound");
const south = numberFrom(/south:\s*([0-9.]+)/, missionMap, "south bound");
const west = numberFrom(/west:\s*([0-9.]+)/, missionMap, "west bound");
const east = numberFrom(/east:\s*([0-9.]+)/, missionMap, "east bound");
const frameLeft = numberFrom(/left:\s*([0-9.]+)/, missionMap, "projection left");
const frameRight = numberFrom(/right:\s*([0-9.]+)/, missionMap, "projection right");
const frameTop = numberFrom(/top:\s*([0-9.]+)/, missionMap, "projection top");
const frameBottom = numberFrom(/bottom:\s*([0-9.]+)/, missionMap, "projection bottom");
const hqLat = numberFrom(/lat:\s*([0-9.]+)/, missionMap, "HQ lat");
const hqLng = numberFrom(/lng:\s*([0-9.]+)/, missionMap, "HQ lng");
const hqLeft = frameLeft + ((hqLng - west) / (east - west)) * (frameRight - frameLeft);
const hqTop = frameTop + ((north - hqLat) / (north - south)) * (frameBottom - frameTop);
assert(hqLeft >= 47 && hqLeft <= 56, `HQ marker should sit around central Singapore horizontally, got ${hqLeft.toFixed(2)}%.`);
assert(hqTop >= 48 && hqTop <= 59, `HQ marker should sit around Orchard/Dhoby Ghaut, not below island, got ${hqTop.toFixed(2)}%.`);
assert(hqTop < 61, "HQ marker must not project below the central mainland.");

for (const label of ["Orchard", "Bukit Timah", "Serangoon", "Tampines", "East Coast", "Jurong", "Woodlands", "CBD"]) {
  assert(missionMap.includes(label), `Missing faint area label: ${label}`);
}

assert(missionMap.includes("data-testid={`map-area-label-"), "Area labels must be rendered with test ids.");
assert(!missionMap.includes("max-w-[17rem] rounded-xl border border-command-cyan/20"), "Large helper box must be removed from the map area.");
assert(missionMap.includes("Add property area or postal code to activate location intelligence."), "Small subtle helper text must remain.");
assert(missionMap.includes("data-testid=\"map-zoom-in\"") && missionMap.includes("data-testid=\"map-zoom-reset\""), "Zoom controls must remain.");
assert(missionMap.includes("Gold = won / hot lead") && missionMap.includes("Amber = follow-up / appointment"), "Map legend must remain.");
assert(!/fetch\(|googleapis|maps\.google|mapbox|geocode|GOOGLE_MAPS|MAPBOX|api[_-]?key/i.test(svgMap + missionMap), "No external map/geocoding API should be added.");

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

const checkedSources = [svgMap, missionMap, health].join("\n").toLowerCase();
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
