import Link from "next/link";
import { missionMapColorClass, type MissionMapData, type MissionMapFilter, type MissionMapPin } from "@/lib/mission-map";

const singaporeBounds = {
  north: 1.47,
  south: 1.23,
  west: 103.62,
  east: 104.04
};

function projectPoint(pin: Pick<MissionMapPin, "lat" | "lng">) {
  const x = ((pin.lng - singaporeBounds.west) / (singaporeBounds.east - singaporeBounds.west)) * 100;
  const y = ((singaporeBounds.north - pin.lat) / (singaporeBounds.north - singaporeBounds.south)) * 100;
  return {
    left: `${Math.min(94, Math.max(6, x))}%`,
    top: `${Math.min(88, Math.max(10, y))}%`
  };
}

function heatClass(intensity: number, urgent: boolean) {
  if (urgent) return "border-command-red/80 bg-command-red/20 text-command-red shadow-[0_0_34px_rgba(239,68,68,0.24)]";
  if (intensity > 0.72) return "border-command-gold/80 bg-command-gold/20 text-command-yellow shadow-[0_0_34px_rgba(214,168,79,0.22)]";
  if (intensity > 0.35) return "border-command-amber/75 bg-command-amber/15 text-command-amber shadow-[0_0_24px_rgba(245,158,11,0.16)]";
  return "border-command-cyan/65 bg-command-cyan/12 text-command-cyan shadow-[0_0_22px_rgba(34,211,238,0.14)]";
}

function areaSelectHref(activeFilter: MissionMapFilter, area: string) {
  return `/?map=${encodeURIComponent(activeFilter)}&area=${encodeURIComponent(area)}#singapore-mission-map`;
}

function SingaporeSilhouette() {
  return (
    <svg
      aria-hidden="true"
      className="singapore-silhouette-map absolute inset-x-3 top-6 h-[72%] w-[calc(100%-1.5rem)] opacity-95 md:inset-x-8 md:w-[calc(100%-4rem)]"
      data-testid="singapore-silhouette-map"
      viewBox="0 0 720 360"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="sg-land-fill" x1="78" x2="670" y1="130" y2="260" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#132334" />
          <stop offset="0.55" stopColor="#0d1827" />
          <stop offset="1" stopColor="#201b10" />
        </linearGradient>
        <filter id="sg-soft-glow" x="-20%" y="-30%" width="140%" height="160%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        className="singapore-island-silhouette"
        d="M76 190 C108 162 150 154 196 164 C235 172 258 148 296 145 C338 141 356 164 391 160 C433 154 460 133 500 142 C543 151 568 179 613 180 C652 180 684 199 694 226 C677 245 635 250 596 244 C553 238 526 256 486 250 C447 244 422 224 383 229 C335 235 312 260 267 258 C218 256 189 236 148 240 C111 243 83 228 64 211 C57 203 59 197 76 190 Z"
        fill="url(#sg-land-fill)"
        stroke="rgba(34,211,238,0.48)"
        strokeWidth="2"
        filter="url(#sg-soft-glow)"
      />
      <path
        d="M102 205 C160 190 221 197 271 210 M268 160 C286 202 278 232 262 255 M344 150 C357 187 354 221 331 250 M414 159 C419 188 413 218 394 236 M498 145 C493 184 506 216 543 244 M578 181 C557 204 544 222 539 244"
        fill="none"
        stroke="rgba(214,168,79,0.22)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M128 176 C192 182 245 177 300 170 C374 160 442 164 516 176 C574 186 629 192 686 205"
        fill="none"
        stroke="rgba(34,211,238,0.18)"
        strokeWidth="1"
        strokeDasharray="7 8"
      />
      <path
        d="M52 228 C42 221 43 213 57 210 C70 207 82 215 82 224 C78 234 62 235 52 228 Z M633 266 C646 258 664 260 676 269 C664 280 642 280 633 266 Z"
        fill="rgba(34,211,238,0.09)"
        stroke="rgba(34,211,238,0.26)"
        strokeWidth="1"
      />
      <path
        d="M92 292 H672 M128 314 H604"
        stroke="rgba(214,168,79,0.15)"
        strokeWidth="1"
        strokeDasharray="2 10"
      />
    </svg>
  );
}

export function SingaporeMissionMap({
  data,
  activeFilter = "all",
  selectedArea = ""
}: {
  data: MissionMapData;
  activeFilter?: MissionMapFilter;
  selectedArea?: string;
}) {
  const priorityArea = data.areaSummaries[0] ?? null;
  const selectedAreaSummary = selectedArea
    ? data.areaSummaries.find((area) => area.area.toLowerCase() === selectedArea.toLowerCase())
    : null;
  const inspectedArea = selectedAreaSummary ?? priorityArea;
  const hasMapData = data.areaSummaries.length > 0 || data.pins.length > 0;
  const mapHeight = hasMapData ? "min-h-[23rem] md:min-h-[26rem]" : "min-h-[17rem] md:min-h-[19rem]";

  return (
    <section
      id="singapore-mission-map"
      className="mission-panel relative overflow-hidden rounded-3xl p-5 md:p-6"
      data-testid="singapore-mission-map"
    >
      <div className="cockpit-grid absolute inset-0 opacity-35" />
      <div className="relative">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Singapore Tactical Map</p>
            <h2 className="mt-1 text-3xl font-semibold text-command-text">Singapore Mission Map</h2>
            <p className="mt-2 text-sm text-command-muted">
              Territory view for leads, site visits and collections. Area-level only, no full addresses on the dashboard.
            </p>
          </div>
          <span className="w-fit rounded-full border border-command-line bg-command-bg/60 px-3 py-1 text-sm font-semibold text-command-muted">
            Unknown area: {data.unknownLocationCount}
          </span>
        </div>

        <div className="thin-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
          {data.filters.map((filter) => {
            const active = filter.key === activeFilter;
            const className = `inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              active
                ? "border-command-gold bg-command-gold text-black"
                : filter.disabled
                  ? "border-command-line bg-command-card text-command-subtle opacity-60"
                  : "border-command-line bg-command-bg/65 text-command-muted hover:border-command-cyan/70 hover:text-command-text"
            }`;
            if (filter.disabled) {
              return <span key={filter.key} className={className}>{filter.label}<strong>{filter.count}</strong></span>;
            }
            return (
              <a key={filter.key} href={filter.href} className={className}>
                {filter.label}<strong>{filter.count}</strong>
              </a>
            );
          })}
        </div>

        <div
          className={`singapore-tactical-map relative mt-5 overflow-hidden rounded-[1.75rem] border border-command-cyan/25 bg-[#07101d]/90 shadow-[inset_0_0_90px_rgba(34,211,238,0.08)] ${mapHeight}`}
          data-testid="singapore-tactical-map"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.11)_0_1px,transparent_2px)] [background-size:30px_30px]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(34,211,238,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(214,168,79,0.06)_1px,transparent_1px)] [background-size:96px_72px]" />
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-command-cyan/10 to-transparent" />
          <SingaporeSilhouette />

          {hasMapData ? (
            <>
              {data.areaSummaries.map((area) => {
                const position = projectPoint(area);
                const urgent = area.overdueCount > 0 || area.riskCount > 0;
                const size = Math.round(28 + area.intensity * 36);
                return (
                  <a
                    key={area.area}
                    href={areaSelectHref(activeFilter, area.area)}
                    className={`tactical-area-halo absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs font-semibold transition hover:scale-110 hover:bg-command-bg/70 ${heatClass(area.intensity, urgent)}`}
                    style={{ ...position, width: `${size}px`, height: `${size}px` }}
                    title={`${area.area}: ${area.leadCount} leads, ${area.hotLeadCount} hot, ${area.followUpDueCount} follow-up, ${area.riskCount} risk`}
                  >
                    {area.leadCount + area.wonJobCount}
                  </a>
                );
              })}
              {data.pins.map((pin) => {
                const position = projectPoint(pin);
                return (
                  <a
                    key={pin.id}
                    href={pin.href || "#"}
                    className={`mission-map-pin absolute z-20 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-command ring-4 ring-command-bg/55 transition hover:z-30 hover:scale-125 ${missionMapColorClass(pin.colorCategory)}`}
                    style={position}
                    title={`${pin.area} - ${pin.label} - ${pin.type} - ${pin.confidence === "exact" ? "Exact/manual coordinate stored; dashboard still area-level" : "Approx. area"}`}
                  />
                );
              })}
            </>
          ) : (
            <div className="absolute left-1/2 top-1/2 z-20 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-command-cyan/25 bg-command-bg/82 p-4 text-center shadow-command backdrop-blur">
              <p className="text-lg font-semibold text-command-text">Singapore Mission Map ready</p>
              <p className="mt-2 text-sm leading-6 text-command-muted">
                Add property area or postal code to leads to activate location intelligence.
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-command-cyan">
                Unknown areas: {data.unknownLocationCount}
              </p>
            </div>
          )}

          <div className="absolute inset-x-3 bottom-3 z-30 rounded-2xl border border-command-line bg-command-bg/76 px-3 py-2 shadow-command backdrop-blur">
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-command-yellow"><span className="h-2.5 w-2.5 rounded-full bg-command-gold" />Gold = won / hot lead</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-command-cyan"><span className="h-2.5 w-2.5 rounded-full bg-command-cyan" />Cyan = active lead</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-command-amber"><span className="h-2.5 w-2.5 rounded-full bg-command-amber" />Amber = follow-up / appointment</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-command-red"><span className="h-2.5 w-2.5 rounded-full bg-command-red" />Red = risk / overdue</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-command-green"><span className="h-2.5 w-2.5 rounded-full bg-command-green" />Green = paid / completed</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-command-muted"><span className="h-2.5 w-2.5 rounded-full bg-command-subtle" />Grey = unknown / inactive</span>
            </div>
          </div>
        </div>

        <div className="map-area-summary-panel mt-5 rounded-2xl border border-command-line bg-command-bg/55 p-4" data-testid="map-area-summary-panel">
          {inspectedArea ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-command-cyan">
                  {selectedAreaSummary ? "Selected Area" : "Priority Area"}
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-command-text">Area: {inspectedArea.area}</h3>
                <div className="mt-3 grid gap-2 text-sm text-command-muted sm:grid-cols-4">
                  <p>Active leads: <strong className="text-command-text">{inspectedArea.leadCount}</strong></p>
                  <p>Hot leads: <strong className="text-command-text">{inspectedArea.hotLeadCount}</strong></p>
                  <p>Follow-up due: <strong className="text-command-text">{inspectedArea.followUpDueCount}</strong></p>
                  <p>Risk: <strong className="text-command-red">{inspectedArea.riskCount + inspectedArea.overdueCount}</strong></p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`/leads?area=${encodeURIComponent(inspectedArea.area)}`} className="rounded-xl border border-command-line bg-command-card px-3 py-2 text-sm font-semibold text-command-text hover:border-command-cyan/70">
                  View leads in area
                </a>
                <Link href="/followups" className="rounded-xl border border-command-line bg-command-card px-3 py-2 text-sm font-semibold text-command-text hover:border-command-amber/70">
                  View follow-ups
                </Link>
                {data.salesCollectionMapLayerAvailable ? (
                  <Link href="/sales-collection" className="rounded-xl border border-command-line bg-command-card px-3 py-2 text-sm font-semibold text-command-text hover:border-command-gold/70">
                    View collections
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-command-muted">Click a zone or pin to inspect area activity.</p>
          )}
        </div>
      </div>
    </section>
  );
}
