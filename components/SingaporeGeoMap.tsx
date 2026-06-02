import { buildSingaporeGeoPaths, singaporeMapSourceMetadata, SINGAPORE_MAP_VIEWBOX } from "@/lib/singapore-map-geometry";

export function SingaporeGeoMap() {
  const paths = buildSingaporeGeoPaths();
  const source = singaporeMapSourceMetadata();
  const mainlandPaths = paths.filter((path) => path.kind !== "sentosa");
  const sentosaPaths = paths.filter((path) => path.kind === "sentosa");

  return (
    <svg
      aria-hidden="true"
      className="accurate-singapore-map real-singapore-outline singapore-map-svg singapore-silhouette-map absolute inset-x-1 top-2 h-[82%] w-[calc(100%-0.5rem)] opacity-95 md:inset-x-4 md:w-[calc(100%-2rem)]"
      data-testid="singapore-silhouette-map"
      data-outline-source="/maps/singapore.geojson"
      data-map-source="/maps/singapore.geojson"
      data-official-planning-area-map={source.officialPlanningArea ? "true" : "false"}
      data-geometry-source={source.source}
      data-map-fit="geojson-bounds"
      viewBox={`0 0 ${SINGAPORE_MAP_VIEWBOX.width} ${SINGAPORE_MAP_VIEWBOX.height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="sg-geo-mainland-fill" x1="80" x2="850" y1="120" y2="420" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#132a3d" />
          <stop offset="0.52" stopColor="#0b1727" />
          <stop offset="1" stopColor="#211d12" />
        </linearGradient>
        <linearGradient id="sg-geo-sentosa-fill" x1="360" x2="530" y1="390" y2="435" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0b1f2e" />
          <stop offset="1" stopColor="#162532" />
        </linearGradient>
        <filter id="sg-geo-soft-glow" x="-16%" y="-28%" width="132%" height="156%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g data-testid="singapore-geojson-map" className="singapore-geojson-map">
        {mainlandPaths.map((path) => (
          <path
            key={path.id}
            className="singapore-mainland singapore-island-silhouette singapore-geojson-feature"
            data-testid={`singapore-geojson-feature-${path.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            d={path.d}
            fill="url(#sg-geo-mainland-fill)"
            stroke="rgba(34,211,238,0.44)"
            strokeWidth="1.15"
            fillOpacity={path.kind === "region" ? 0.68 : 0.86}
            filter="url(#sg-geo-soft-glow)"
          />
        ))}
        {sentosaPaths.map((path) => (
          <path
            key={path.id}
            className="singapore-sentosa singapore-geojson-feature"
            data-testid="sentosa-outline"
            d={path.d}
            fill="url(#sg-geo-sentosa-fill)"
            stroke="rgba(34,211,238,0.42)"
            strokeWidth="1.25"
          />
        ))}
      </g>
      <path
        className="singapore-map-baseline"
        d="M76 506 H824"
        stroke="rgba(255,213,74,0.12)"
        strokeWidth="1"
        strokeDasharray="2 10"
      />
    </svg>
  );
}
