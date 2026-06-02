import singaporeGeoJson from "@/lib/singapore-map-data.json";

type Position = [number, number];
type LinearRing = Position[];
type PolygonCoordinates = LinearRing[];
type MultiPolygonCoordinates = PolygonCoordinates[];

type GeoJsonFeature = {
  type: "Feature";
  id?: string;
  properties?: Record<string, unknown>;
  geometry?: {
    type: "Polygon" | "MultiPolygon";
    coordinates: PolygonCoordinates | MultiPolygonCoordinates;
  } | null;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type SingaporeMapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type SingaporeProjectedPoint = {
  x: number;
  y: number;
  left: string;
  top: string;
};

export type SingaporeGeoPath = {
  id: string;
  name: string;
  d: string;
  ringCount: number;
  area: number;
  kind: "mainland" | "sentosa" | "region";
};

export const SINGAPORE_MAP_VIEWBOX = {
  width: 900,
  height: 520,
  padding: 34
} as const;

export const LIMM_HQ_COORDINATE = {
  lat: 1.3008,
  lng: 103.8375,
  label: "LIMM HQ",
  title: "LIMM Works HQ / Postal: 228397",
  postalCode: "228397"
} as const;

export const SINGAPORE_AREA_LABELS = [
  { label: "Woodlands", lat: 1.437, lng: 103.786 },
  { label: "Punggol / Sengkang", lat: 1.398, lng: 103.904 },
  { label: "Jurong", lat: 1.333, lng: 103.704 },
  { label: "Bukit Timah", lat: 1.329, lng: 103.802 },
  { label: "Orchard", lat: 1.303, lng: 103.835 },
  { label: "CBD", lat: 1.285, lng: 103.852 },
  { label: "Serangoon", lat: 1.352, lng: 103.873 },
  { label: "Tampines", lat: 1.354, lng: 103.944 },
  { label: "Bedok", lat: 1.324, lng: 103.93 },
  { label: "East Coast", lat: 1.305, lng: 103.913 }
] as const;

const geoJson = singaporeGeoJson as unknown as GeoJsonFeatureCollection;

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";
}

function collectPositions(value: unknown, positions: Position[] = []) {
  if (isPosition(value)) {
    positions.push(value);
    return positions;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPositions(item, positions);
  }
  return positions;
}

function polygonRings(feature: GeoJsonFeature): LinearRing[] {
  if (!feature.geometry) return [];
  if (feature.geometry.type === "Polygon") return feature.geometry.coordinates as PolygonCoordinates;
  return (feature.geometry.coordinates as MultiPolygonCoordinates).flatMap((polygon) => polygon);
}

function signedRingArea(ring: LinearRing) {
  let total = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    total += x1 * y2 - x2 * y1;
  }
  return total / 2;
}

function ringArea(ring: LinearRing) {
  return Math.abs(signedRingArea(ring));
}

function buildBounds(features: GeoJsonFeature[]): SingaporeMapBounds {
  const positions = features.flatMap((feature) => collectPositions(feature.geometry?.coordinates ?? []));
  const longitudes = positions.map(([lng]) => lng);
  const latitudes = positions.map(([, lat]) => lat);
  return {
    west: Math.min(...longitudes),
    east: Math.max(...longitudes),
    south: Math.min(...latitudes),
    north: Math.max(...latitudes)
  };
}

const features = Array.isArray(geoJson.features) ? geoJson.features : [];
const bounds = buildBounds(features);

export function getSingaporeMapBounds() {
  return bounds;
}

export function projectSingaporeCoordinate({
  lat,
  lng
}: {
  lat: number;
  lng: number;
}): SingaporeProjectedPoint {
  const { width, height, padding } = SINGAPORE_MAP_VIEWBOX;
  const geoWidth = bounds.east - bounds.west;
  const geoHeight = bounds.north - bounds.south;
  const scale = Math.min((width - padding * 2) / geoWidth, (height - padding * 2) / geoHeight);
  const projectedWidth = geoWidth * scale;
  const projectedHeight = geoHeight * scale;
  const offsetX = (width - projectedWidth) / 2;
  const offsetY = (height - projectedHeight) / 2;
  const x = offsetX + (lng - bounds.west) * scale;
  const y = offsetY + (bounds.north - lat) * scale;

  return {
    x,
    y,
    left: `${Math.min(94, Math.max(6, (x / width) * 100))}%`,
    top: `${Math.min(86, Math.max(8, (y / height) * 100))}%`
  };
}

function ringToPath(ring: LinearRing) {
  return ring
    .map(([lng, lat], index) => {
      const point = projectSingaporeCoordinate({ lat, lng });
      const command = index === 0 ? "M" : "L";
      return `${command}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    })
    .join(" ");
}

function featureArea(feature: GeoJsonFeature) {
  return polygonRings(feature).reduce((sum, ring) => sum + ringArea(ring), 0);
}

export function buildSingaporeGeoPaths(): SingaporeGeoPath[] {
  const maxArea = Math.max(...features.map(featureArea));

  return features
    .map((feature, featureIndex) => {
      const name = String(feature.properties?.name ?? feature.id ?? `Singapore region ${featureIndex + 1}`);
      const rings = polygonRings(feature);
      const area = featureArea(feature);
      const kind: SingaporeGeoPath["kind"] = /sentosa/i.test(name)
        ? "sentosa"
        : area >= maxArea * 0.98
          ? "mainland"
          : "region";

      return {
        id: String(feature.id ?? name),
        name,
        d: rings.map((ring) => `${ringToPath(ring)} Z`).join(" "),
        ringCount: rings.length,
        area,
        kind
      };
    })
    .filter((path) => path.d.length > 0);
}

export function singaporeGeoJsonAssetAvailable() {
  return geoJson.type === "FeatureCollection" && features.length >= 5 && buildSingaporeGeoPaths().length >= 5;
}
