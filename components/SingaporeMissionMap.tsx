"use client";

import Link from "next/link";
import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from "react";
import { SingaporeSvgMap } from "@/components/SingaporeSvgMap";
import {
  LIMM_HQ_COORDINATE,
  projectSingaporeCoordinate,
  SINGAPORE_AREA_LABELS
} from "@/lib/singapore-map-geometry";
import type { MissionMapColorCategory, MissionMapData, MissionMapFilter, MissionMapPin } from "@/lib/mission-map";

const limmHqLocation = {
  ...LIMM_HQ_COORDINATE,
  title: "LIMM Works HQ / Postal: 228397"
};

function projectPoint(pin: Pick<MissionMapPin, "lat" | "lng">) {
  return projectSingaporeCoordinate(pin);
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
            <p className="mt-2 text-sm text-command-muted">Territory view for leads, site visits and collections. Area-level only.</p>
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
            <SingaporeSvgMap />

            {SINGAPORE_AREA_LABELS.filter((area) => area.visible).map((area) => (
              <span
                key={area.label}
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-command-muted/45"
                data-testid={`map-area-label-${area.label.toLowerCase().replace(/\s+/g, "-")}`}
                data-planning-area={area.featureName}
                style={{ left: area.left, top: area.top }}
              >
                {area.label}
              </span>
            ))}

            <button
              type="button"
              className="singapore-hq-marker limm-hq-marker absolute z-30 -translate-x-1/2 -translate-y-1/2"
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
            </button>

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
            <div className="absolute left-3 top-3 z-30 rounded-full border border-command-line bg-command-bg/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-command-muted backdrop-blur">
              No mapped leads yet
            </div>
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
