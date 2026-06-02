import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DATASETS = {
  planningArea: {
    id: "d_4765db0e87b9c86336792efe8a1f7a66",
    name: "Master Plan 2019 Planning Area Boundary (No Sea)",
    assetPath: "public/maps/singapore-planning-area-no-sea.geojson",
    viewUrl: "https://data.gov.sg/datasets/d_4765db0e87b9c86336792efe8a1f7a66/view"
  },
  region: {
    id: "d_bf4d24df9129d5a8ff8cf82e20959ee0",
    name: "Master Plan 2019 Region Boundary (No Sea)",
    assetPath: "public/maps/singapore-region-no-sea.geojson",
    viewUrl: "https://data.gov.sg/datasets/d_bf4d24df9129d5a8ff8cf82e20959ee0/view"
  }
};

function usage() {
  console.log("Usage: node scripts/download_official_singapore_map.mjs [planning-area|region]");
}

function writeJson(relativePath, value) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function roundCoordinate(value) {
  return Number(value.toFixed(6));
}

function normalizeCoordinates(value) {
  if (Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    return [roundCoordinate(value[0]), roundCoordinate(value[1])];
  }
  if (Array.isArray(value)) return value.map(normalizeCoordinates);
  return value;
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

function boundsFor(features) {
  const positions = collectPositions(features.map((feature) => feature.geometry?.coordinates ?? []));
  return [
    Math.min(...positions.map(([lng]) => lng)),
    Math.min(...positions.map(([, lat]) => lat)),
    Math.max(...positions.map(([lng]) => lng)),
    Math.max(...positions.map(([, lat]) => lat))
  ];
}

function normalizeFeature(feature, index) {
  const properties = feature.properties ?? {};
  const name =
    properties.PLN_AREA_N ??
    properties.REGION_N ??
    properties.name ??
    properties.Name ??
    properties.NAME ??
    `Singapore boundary ${index + 1}`;

  return {
    type: "Feature",
    id: String(properties.OBJECTID ?? feature.id ?? name),
    properties: {
      name: String(name),
      planningArea: properties.PLN_AREA_N ?? null,
      planningAreaCode: properties.PLN_AREA_C ?? null,
      region: properties.REGION_N ?? null,
      regionCode: properties.REGION_C ?? null,
      objectId: properties.OBJECTID ?? null,
      source: "data.gov.sg / URA"
    },
    geometry: {
      type: feature.geometry?.type,
      coordinates: normalizeCoordinates(feature.geometry?.coordinates ?? [])
    }
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${url}`);
  return response.json();
}

async function main() {
  const requested = process.argv[2] ?? "planning-area";
  const selected = requested === "region" ? DATASETS.region : DATASETS.planningArea;
  if (!["planning-area", "region", undefined].includes(process.argv[2])) {
    usage();
    process.exit(1);
  }

  const pollUrl = `https://api-open.data.gov.sg/v1/public/api/datasets/${selected.id}/poll-download`;
  console.log(`Fetching official ${selected.name} from data.gov.sg...`);
  const poll = await fetchJson(pollUrl);
  if (poll.code !== 0 || !poll.data?.url) {
    throw new Error(`data.gov.sg did not return a download URL: ${poll.errMsg ?? "unknown error"}`);
  }

  const source = await fetchJson(poll.data.url);
  if (source.type !== "FeatureCollection" || !Array.isArray(source.features) || source.features.length === 0) {
    throw new Error("Downloaded map is not a usable GeoJSON FeatureCollection.");
  }

  const features = source.features.map(normalizeFeature);
  const output = {
    type: "FeatureCollection",
    name: requested === "region" ? "URA_MP19_REGION_NO_SEA_LOCAL" : "URA_MP19_PLNG_AREA_NO_SEA_LOCAL",
    title: `Singapore ${selected.name}`,
    version: "v6_4_6_official_ura_no_sea_map",
    source: `data.gov.sg / URA ${selected.name}`,
    sourceDatasetId: selected.id,
    sourceUrl: selected.viewUrl,
    licence: "Singapore Open Data Licence",
    downloadedAt: new Date().toISOString(),
    bbox: boundsFor(features),
    features
  };

  writeJson(selected.assetPath, output);
  writeJson("public/maps/singapore.geojson", output);
  writeJson("lib/singapore-map-data.json", output);

  console.log(`Wrote ${selected.assetPath}`);
  console.log("Wrote public/maps/singapore.geojson");
  console.log("Wrote lib/singapore-map-data.json");
  console.log(`Features: ${features.length}`);
}

main().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});
