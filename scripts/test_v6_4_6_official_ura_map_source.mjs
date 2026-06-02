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

const script = read("scripts/download_official_singapore_map.mjs");
const pkg = read("package.json");
const docs = read("docs/V6_4_6_OFFICIAL_URA_NO_SEA_MAP_SOURCE.md");
const geoMap = read("components/SingaporeGeoMap.tsx");
const geometry = read("lib/singapore-map-geometry.ts");

for (const required of [
  "d_4765db0e87b9c86336792efe8a1f7a66",
  "d_bf4d24df9129d5a8ff8cf82e20959ee0",
  "https://api-open.data.gov.sg/v1/public/api/datasets/",
  "poll-download",
  "public/maps/singapore-planning-area-no-sea.geojson",
  "public/maps/singapore-region-no-sea.geojson",
  "public/maps/singapore.geojson",
  "lib/singapore-map-data.json",
  "Singapore Open Data Licence"
]) {
  assert(script.includes(required) || docs.includes(required), `Official URA map source proof missing: ${required}`);
}

assert(pkg.includes('"map:download-official"'), "package.json must expose map:download-official.");
assert(geoMap.includes('data-map-source="/maps/singapore.geojson"'), "Dashboard map must still render a local GeoJSON asset.");
assert(geometry.includes('import singaporeGeoJson from "@/lib/singapore-map-data.json"'), "Dashboard map must use bundled local map data, not a runtime URL.");

const scanned = [script, pkg, docs, geoMap, geometry].join("\n").toLowerCase();
for (const forbidden of [
  "gadm",
  "github gist",
  "gist.github",
  "maps.google",
  "google_maps",
  "mapbox",
  "tile.openstreetmap",
  "leaflet",
  "runtime external api"
]) {
  assert(!scanned.includes(forbidden), `Forbidden map source/runtime dependency found: ${forbidden}`);
}

console.log("PASS: v6.4.6 official URA/data.gov.sg map source checks passed.");
