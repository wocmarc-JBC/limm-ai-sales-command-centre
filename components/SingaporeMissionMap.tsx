"use client";

import Link from "next/link";
import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from "react";
import type { MissionMapColorCategory, MissionMapData, MissionMapFilter, MissionMapPin } from "@/lib/mission-map";

const singaporeBounds = {
  north: 1.47,
  south: 1.23,
  west: 103.62,
  east: 104.04
};

const limmHqLocation = {
  lat: 1.306,
  lng: 103.835,
  label: "LIMM HQ",
  title: "LIMM Works HQ - Postal: 228397"
};

function projectPoint(pin: Pick<MissionMapPin, "lat" | "lng">) {
  const x = ((pin.lng - singaporeBounds.west) / (singaporeBounds.east - singaporeBounds.west)) * 100;
  const y = ((singaporeBounds.north - pin.lat) / (singaporeBounds.north - singaporeBounds.south)) * 100;
  return {
    left: `${Math.min(94, Math.max(6, x))}%`,
    top: `${Math.min(88, Math.max(10, y))}%`
  };
}

function boundedZoom(nextZoom: number) {
  return Math.min(2.35, Math.max(1, Number(nextZoom.toFixed(2))));
}

function boundedPan(value: number, zoomLevel: number) {
  const limit = Math.max(0, (zoomLevel - 1) * 120);
  return Math.min(limit, Math.max(-limit, value));
}

function missionMapColorClass(category: MissionMapColorCategory) {
  const colors: Record<MissionMapColorCategory, string> = {
    hot: "border-[#FFD54A] bg-[#FFD54A] text-black",
    active: "border-command-cyan bg-command-cyan text-black",
    follow_up: "border-[#FF8A00] bg-[#FF8A00] text-black",
    risk: "border-command-red bg-command-red text-white",
    won: "border-[#FFD54A] bg-[#FFD54A] text-black",
    paid: "border-command-green bg-command-green text-black",
    unknown: "border-command-subtle bg-command-subtle text-black"
  };
  return colors[category];
}

function heatClass(intensity: number, urgent: boolean) {
  if (urgent) return "border-command-red/85 bg-command-red/20 text-command-red shadow-[0_0_38px_rgba(239,68,68,0.28)]";
  if (intensity > 0.72) return "border-[#FFD54A]/85 bg-[#FFD54A]/20 text-[#FFD54A] shadow-[0_0_42px_rgba(255,213,74,0.28)]";
  if (intensity > 0.35) return "border-[#FF8A00]/80 bg-[#FF8A00]/20 text-[#FF9F1A] shadow-[0_0_32px_rgba(255,138,0,0.22)]";
  return "border-command-cyan/65 bg-command-cyan/12 text-command-cyan shadow-[0_0_24px_rgba(34,211,238,0.16)]";
}

function areaSelectHref(activeFilter: MissionMapFilter, area: string) {
  return `/?map=${encodeURIComponent(activeFilter)}&area=${encodeURIComponent(area)}#singapore-mission-map`;
}

function SingaporeSilhouette() {
  return (
    <svg
      aria-hidden="true"
      className="accurate-singapore-map singapore-silhouette-map absolute inset-x-1 top-4 h-[78%] w-[calc(100%-0.5rem)] opacity-95 md:inset-x-4 md:w-[calc(100%-2rem)]"
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
        stroke="rgba(255,213,74,0.24)"
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
        className="sentosa-island singapore-sentosa-only"
        d="M282 320 C318 304 372 304 407 322 C378 341 318 341 282 320 Z"
        fill="rgba(34,211,238,0.1)"
        stroke="rgba(34,211,238,0.3)"
        strokeWidth="1"
      />
      <path
        d="M70 318 H705 M110 344 H648"
        stroke="rgba(255,213,74,0.16)"
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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const priorityArea = data.areaSummaries[0] ?? null;
  const selectedAreaSummary = selectedArea
    ? data.areaSummaries.find((area) => area.area.toLowerCase() === selectedArea.toLowerCase())
    : null;
  const inspectedArea = selectedAreaSummary ?? priorityArea;
  const hasMapData = data.areaSummaries.length > 0 || data.pins.length > 0;
  const mapHeight = hasMapData ? "min-h-[30rem] md:min-h-[38rem]" : "min-h-[27rem] md:min-h-[34rem]";
  const hqPosition = useMemo(() => projectPoint(limmHqLocation), []);

  function updateZoom(nextZoom: number) {
    const bounded = boundedZoom(nextZoom);
    setZoom(bounded);
    setPan((current) => ({
      x: boundedPan(current.x, bounded),
      y: boundedPan(current.y, bounded)
    }));
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    updateZoom(zoom + (event.deltaY < 0 ? 0.14 : -0.14));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (zoom <= 1) return;
    setDragStart({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    setPan({
      x: boundedPan(dragStart.panX + event.clientX - dragStart.x, zoom),
      y: boundedPan(dragStart.panY + event.clientY - dragStart.y, zoom)
    });
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStart) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragStart(null);
  }

  function resetMapView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  return (
    <section
      id="singapore-mission-map"
      className="mission-panel singapore-map-wide-layout relative overflow-hidden rounded-3xl p-4 md:p-6 lg:p-7"
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
                ? "border-[#FFD54A] bg-[#FFD54A] text-black"
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
          ref={mapViewportRef}
          className={`singapore-tactical-map relative mt-5 overflow-hidden rounded-[1.75rem] border border-command-cyan/25 bg-[#07101d]/90 shadow-[inset_0_0_110px_rgba(34,211,238,0.1)] ${mapHeight} ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
          data-testid="singapore-tactical-map"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.11)_0_1px,transparent_2px)] [background-size:30px_30px]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(34,211,238,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(255,213,74,0.06)_1px,transparent_1px)] [background-size:96px_72px]" />
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-command-cyan/10 to-transparent" />

          <div
            className="absolute inset-0"
            data-testid="singapore-map-transform-layer"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "50% 50%",
              transition: dragStart ? "none" : "transform 180ms ease"
            }}
          >
            <SingaporeSilhouette />

            <div
              className="limm-hq-marker absolute z-30 -translate-x-1/2 -translate-y-1/2"
              data-testid="limm-hq-marker"
              style={hqPosition}
              title={limmHqLocation.title}
            >
              <div className="relative flex items-center justify-center">
                <span className="absolute h-10 w-10 rounded-full border border-[#FFD54A]/40 bg-[#FFD54A]/10 shadow-[0_0_24px_rgba(255,213,74,0.34)]" />
                <span className="relative h-4 w-4 rounded-full border-2 border-black bg-[#FFD54A] shadow-command" />
                <span className="absolute left-5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-[#FFD54A]/40 bg-command-bg/78 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[#FFD54A] backdrop-blur">
                  {limmHqLocation.label}
                </span>
              </div>
            </div>

            {data.areaSummaries.map((area) => {
              const position = projectPoint(area);
              const urgent = area.overdueCount > 0 || area.riskCount > 0;
              const size = Math.round(32 + area.intensity * 42);
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
          </div>

          <div className="absolute right-3 top-3 z-40 flex items-center gap-2 rounded-full border border-command-line bg-command-bg/74 px-2 py-1 shadow-command backdrop-blur">
            <button
              type="button"
              className="h-8 w-8 rounded-full border border-command-cyan/35 bg-command-card text-sm font-bold text-command-cyan hover:border-command-cyan hover:text-command-text"
              data-testid="map-zoom-out"
              aria-label="Zoom out Singapore map"
              onClick={() => updateZoom(zoom - 0.2)}
            >
              -
            </button>
            <span className="min-w-12 text-center text-xs font-semibold text-command-muted">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="h-8 w-8 rounded-full border border-command-cyan/35 bg-command-card text-sm font-bold text-command-cyan hover:border-command-cyan hover:text-command-text"
              data-testid="map-zoom-in"
              aria-label="Zoom in Singapore map"
              onClick={() => updateZoom(zoom + 0.2)}
            >
              +
            </button>
            <button
              type="button"
              className="rounded-full border border-[#FFD54A]/35 bg-command-card px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#FFD54A] hover:border-[#FFD54A]"
              data-testid="map-zoom-reset"
              onClick={resetMapView}
            >
              Reset
            </button>
          </div>

          {!hasMapData ? (
            <>
              <div className="absolute left-3 top-3 z-30 rounded-full border border-command-line bg-command-bg/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-command-muted backdrop-blur">
                No mapped leads yet
              </div>
              <div className="absolute left-3 bottom-16 z-30 max-w-[17rem] rounded-xl border border-command-cyan/20 bg-command-bg/58 px-3 py-2 text-xs leading-5 text-command-muted backdrop-blur">
                Add property area or postal code to improve location intelligence.
              </div>
            </>
          ) : null}

          <div className="absolute inset-x-3 bottom-3 z-40 rounded-2xl border border-command-line bg-command-bg/76 px-3 py-2 shadow-command backdrop-blur">
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[#FFD54A]"><span className="h-2.5 w-2.5 rounded-full bg-[#FFD54A]" />Gold = won / hot lead</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-command-cyan"><span className="h-2.5 w-2.5 rounded-full bg-command-cyan" />Cyan = active lead</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[#FF9F1A]"><span className="h-2.5 w-2.5 rounded-full bg-[#FF8A00]" />Amber = follow-up / appointment</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-command-red"><span className="h-2.5 w-2.5 rounded-full bg-command-red" />Red = risk / overdue</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-command-green"><span className="h-2.5 w-2.5 rounded-full bg-command-green" />Green = paid / completed</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-command-muted"><span className="h-2.5 w-2.5 rounded-full bg-command-subtle" />Grey = unknown / inactive</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[#FFD54A]"><span className="h-2.5 w-2.5 rounded-full border border-black bg-[#FFD54A]" />LIMM HQ = office base</span>
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
                <Link href="/followups" className="rounded-xl border border-command-line bg-command-card px-3 py-2 text-sm font-semibold text-command-text hover:border-[#FF8A00]/70">
                  View follow-ups
                </Link>
                {data.salesCollectionMapLayerAvailable ? (
                  <Link href="/sales-collection" className="rounded-xl border border-command-line bg-command-card px-3 py-2 text-sm font-semibold text-command-text hover:border-[#FFD54A]/70">
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
