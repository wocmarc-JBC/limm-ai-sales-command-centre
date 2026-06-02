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
      className="accurate-singapore-map singapore-silhouette-map absolute inset-x-3 top-5 h-[76%] w-[calc(100%-1.5rem)] opacity-95 md:inset-x-7 md:w-[calc(100%-3.5rem)]"
      data-testid="singapore-silhouette-map"
      viewBox="0 0 760 430"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="sg-land-fill" x1="66" x2="704" y1="128" y2="278" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#14283a" />
          <stop offset="0.52" stopColor="#0b1727" />
          <stop offset="1" stopColor="#211d12" />
        </linearGradient>
        <filter id="sg-soft-glow" x="-18%" y="-28%" width="136%" height="156%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        className="singapore-island-silhouette"
        d="M59 225 L82 203 L119 188 L151 177 L191 171 L233 176 L265 166 L299 150 L335 147 L370 158 L401 151 L431 136 L467 130 L505 137 L539 157 L573 170 L619 176 L657 189 L699 204 L733 226 L715 246 L680 254 L635 251 L593 240 L552 247 L510 264 L463 261 L419 244 L379 249 L336 268 L296 285 L249 283 L206 266 L165 260 L122 267 L84 260 L55 243 Z"
        fill="url(#sg-land-fill)"
        stroke="rgba(34,211,238,0.52)"
        strokeWidth="2"
        filter="url(#sg-soft-glow)"
      />
      <path
        d="M82 221 C137 205 187 205 235 213 M246 177 C270 219 269 254 248 281 M330 150 C350 192 350 234 327 271 M415 142 C422 184 415 224 389 250 M501 139 C495 185 514 229 552 248 M596 177 C570 204 556 225 552 247 M652 190 C637 213 625 234 617 250"
        fill="none"
        stroke="rgba(214,168,79,0.22)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M96 196 C171 188 236 190 306 174 C386 154 468 159 558 178 C624 191 683 199 724 218"
        fill="none"
        stroke="rgba(34,211,238,0.18)"
        strokeWidth="1"
        strokeDasharray="7 8"
      />
      <path
        className="singapore-visible-islands"
        d="M284 314 C321 300 359 300 391 313 C366 331 318 334 284 314 Z M39 239 C27 232 27 222 43 218 C58 215 72 224 72 235 C66 246 49 247 39 239 Z M618 306 C638 294 667 297 686 312 C666 329 634 327 618 306 Z M690 149 C717 141 737 150 746 170 C728 181 697 176 690 149 Z M650 116 C667 110 680 115 687 128 C674 137 654 133 650 116 Z"
        fill="rgba(34,211,238,0.1)"
        stroke="rgba(34,211,238,0.3)"
        strokeWidth="1"
      />
      <path
        d="M70 318 H705 M110 344 H648"
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

          {!hasMapData ? (
            <>
              <div className="absolute right-3 top-3 z-20 rounded-full border border-command-line bg-command-bg/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-command-muted backdrop-blur">
                No mapped leads yet
              </div>
              <div className="absolute left-3 bottom-16 z-20 max-w-[17rem] rounded-xl border border-command-cyan/20 bg-command-bg/58 px-3 py-2 text-xs leading-5 text-command-muted backdrop-blur">
                Add property area or postal code to improve location intelligence.
              </div>
            </>
          ) : null}

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
