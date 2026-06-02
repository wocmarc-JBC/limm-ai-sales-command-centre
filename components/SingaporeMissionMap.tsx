"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
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

const defaultZoom = 1;
const minZoom = 1;
const maxZoom = 4;
const zoomStep = 0.25;
const wheelZoomStep = 0.12;
const panLimitPerZoom = 220;
const genericFilterEmptyStateText = "No mapped items for this filter.";
const filterEmptyStateLabels: Record<MissionMapFilter, string> = {
  all: "No mapped leads yet",
  leads: "No mapped leads yet",
  hot: "No mapped hot leads yet",
  won: "No mapped won jobs yet",
  site_visits: "No mapped appointments yet",
  followups: "No mapped follow-ups yet",
  collections: "No mapped collections yet",
  overdue: "No mapped risks yet"
};

function projectPoint(pin: Pick<MissionMapPin, "lat" | "lng">) {
  return projectSingaporeCoordinate(pin);
}

function boundedZoom(nextZoom: number) {
  return Math.min(maxZoom, Math.max(minZoom, Number(nextZoom.toFixed(2))));
}

function boundedPan(value: number, zoomLevel: number) {
  const limit = Math.max(0, (zoomLevel - defaultZoom) * panLimitPerZoom);
  return Math.min(limit, Math.max(-limit, value));
}

function areaPriorityColor(area: {
  overdueCount: number;
  riskCount: number;
  hotLeadCount: number;
  wonJobCount: number;
  followUpDueCount: number;
  appointmentCount: number;
}): MissionMapColorCategory {
  if (area.overdueCount > 0 || area.riskCount > 0) return "risk";
  if (area.hotLeadCount > 0 || area.wonJobCount > 0) return "hot";
  if (area.followUpDueCount > 0 || area.appointmentCount > 0) return "follow_up";
  return "active";
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
  const [selectedAreaName, setSelectedAreaName] = useState(selectedArea);
  const [selectedPin, setSelectedPin] = useState<MissionMapPin | null>(null);
  const [hqSelected, setHqSelected] = useState(false);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const dragMovedRef = useRef(false);
  const priorityArea = data.areaSummaries[0] ?? null;
  const visiblePinAreas = useMemo(() => new Set(data.pins.map((pin) => pin.area)), [data.pins]);
  const visiblePinCountByArea = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pin of data.pins) counts.set(pin.area, (counts.get(pin.area) ?? 0) + 1);
    return counts;
  }, [data.pins]);
  const displayedAreaSummaries = useMemo(() => {
    if (activeFilter === "all") return data.areaSummaries;
    return data.areaSummaries.filter((area) => visiblePinAreas.has(area.area));
  }, [activeFilter, data.areaSummaries, visiblePinAreas]);
  const selectedAreaSummary = selectedAreaName
    ? data.areaSummaries.find((area) => area.area.toLowerCase() === selectedAreaName.toLowerCase())
    : null;
  const inspectedArea = selectedAreaSummary ?? priorityArea;
  const hasMapData = data.areaSummaries.length > 0 || data.pins.length > 0;
  const hasFilteredMapData = displayedAreaSummaries.length > 0 || data.pins.length > 0;
  const mapHeight = hasMapData ? "min-h-[30rem] md:min-h-[38rem]" : "min-h-[27rem] md:min-h-[34rem]";
  const hqPosition = useMemo(() => projectPoint(limmHqLocation), []);
  const canZoomOut = zoom > minZoom;
  const canZoomIn = zoom < maxZoom;
  const showFilterEmptyState = activeFilter !== "all" && !hasFilteredMapData;
  const mapStatusBadge = showFilterEmptyState ? filterEmptyStateLabels[activeFilter] : !hasMapData ? "No mapped leads yet" : "";
  const showLocationHelper = !hasMapData || showFilterEmptyState;

  const updateZoom = useCallback((nextZoom: number) => {
    const bounded = boundedZoom(nextZoom);
    setZoom(bounded);
    setPan((current) => ({
      x: boundedPan(current.x, bounded),
      y: boundedPan(current.y, bounded)
    }));
  }, []);

  useEffect(() => {
    setSelectedAreaName(selectedArea);
  }, [selectedArea]);

  useEffect(() => {
    const viewport = mapViewportRef.current;
    if (!viewport) return undefined;

    function handleNativeWheel(event: WheelEvent) {
      const wheelDelta = event.deltaY || event.deltaX;
      event.preventDefault();
      event.stopPropagation();
      if (wheelDelta === 0) return;
      updateZoom(zoom + (wheelDelta < 0 ? wheelZoomStep : -wheelZoomStep));
    }

    viewport.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleNativeWheel);
  }, [updateZoom, zoom]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragMovedRef.current = false;
    if (zoom <= minZoom) return;
    setDragStart({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    const deltaX = event.clientX - dragStart.x;
    const deltaY = event.clientY - dragStart.y;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 8) dragMovedRef.current = true;
    setPan({
      x: boundedPan(dragStart.panX + deltaX, zoom),
      y: boundedPan(dragStart.panY + deltaY, zoom)
    });
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStart && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragStart(null);
  }

  function resetMapView() {
    setZoom(defaultZoom);
    setPan({ x: 0, y: 0 });
    setSelectedPin(null);
    setSelectedAreaName("");
    setHqSelected(false);
    setDragStart(null);
  }

  function selectArea(area: string) {
    if (dragMovedRef.current) return;
    setSelectedAreaName(area);
    setSelectedPin(null);
    setHqSelected(false);
  }

  function selectPin(pin: MissionMapPin, event: ReactMouseEvent<HTMLAnchorElement>) {
    if (dragMovedRef.current) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    setSelectedPin(pin);
    setSelectedAreaName(pin.area);
    setHqSelected(false);
  }

  function selectHq() {
    if (dragMovedRef.current) return;
    setHqSelected(true);
    setSelectedPin(null);
    setSelectedAreaName("");
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
          className={`singapore-tactical-map relative mt-5 overflow-hidden rounded-[1.75rem] border border-command-cyan/25 bg-[#07101d]/90 shadow-[inset_0_0_110px_rgba(34,211,238,0.1)] ${mapHeight} ${zoom > minZoom ? "cursor-grab active:cursor-grabbing" : ""}`}
          data-testid="singapore-tactical-map"
          data-default-zoom={defaultZoom}
          data-min-zoom={minZoom}
          data-max-zoom={maxZoom}
          data-zoom-step={zoomStep}
          data-default-zoom-starts-at-100="true"
          data-wheel-zoom="native-passive-false"
          data-wheel-page-scroll-lock="true"
          data-default-fit-improved="true"
          data-horizontal-space-optimized="true"
          data-map-top-left-copy-deduped="true"
          data-map-no-stacked-status-labels="true"
          data-map-helper-text-position="below-map"
          data-filter-empty-state-copy={genericFilterEmptyStateText}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerLeave={handlePointerEnd}
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
              transition: dragStart ? "none" : "transform 160ms ease-out"
            }}
          >
            <SingaporeSvgMap />

            {SINGAPORE_AREA_LABELS.filter((area) => area.visible).map((area) => (
              <span
                key={area.label}
                className={`pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-command-muted/60 transition ${zoom > 1.25 ? "opacity-90" : "opacity-70"}`}
                data-testid={`map-area-label-${area.label.toLowerCase().replace(/\s+/g, "-")}`}
                data-planning-area={area.featureName}
                style={{ left: area.left, top: area.top }}
              >
                {area.label}
              </span>
            ))}

            <button
              type="button"
              className="singapore-hq-marker limm-hq-marker map-hq-marker-compact absolute z-30 -translate-x-1/2 -translate-y-1/2"
              data-testid="limm-hq-marker"
              data-hq-marker-scale-polished="true"
              style={hqPosition}
              title={limmHqLocation.title}
              aria-pressed={hqSelected}
              onClick={selectHq}
            >
              <div className="relative flex items-center justify-center">
                <span className="absolute h-8 w-8 rounded-full border border-[#FFD54A]/35 bg-[#FFD54A]/10 shadow-[0_0_18px_rgba(255,213,74,0.28)]" />
                <span className="relative h-3 w-3 rounded-full border-2 border-black bg-[#FFD54A] shadow-command" />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-[#FFD54A]/35 bg-command-bg/78 px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[#FFD54A] backdrop-blur">
                  {limmHqLocation.label}
                </span>
              </div>
            </button>

            {displayedAreaSummaries.map((area) => {
              const position = projectPoint(area);
              const urgent = area.overdueCount > 0 || area.riskCount > 0;
              const visibleCount = visiblePinCountByArea.get(area.area) ?? area.leadCount + area.wonJobCount;
              if (visibleCount <= 0) return null;
              const size = Math.round(30 + Math.min(1, area.intensity) * 34);
              const colorCategory = areaPriorityColor(area);
              return (
                <button
                  type="button"
                  key={area.area}
                  className={`tactical-area-halo map-area-count-bubble absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs font-semibold transition hover:scale-110 hover:bg-command-bg/70 ${heatClass(area.intensity, urgent)} ${missionMapColorClass(colorCategory)}`}
                  style={{ ...position, width: `${size}px`, height: `${size}px` }}
                  title={`${area.area}: ${area.leadCount} leads, ${area.hotLeadCount} hot, ${area.followUpDueCount} follow-up, ${area.riskCount} risk`}
                  data-testid={`map-area-count-bubble-${area.area.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => selectArea(area.area)}
                >
                  {visibleCount}
                </button>
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
                  data-testid={`map-pin-${pin.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  onClick={(event) => selectPin(pin, event)}
                />
              );
            })}
          </div>

          <div className="absolute right-3 top-3 z-40 flex items-center gap-2 rounded-full border border-command-line bg-command-bg/74 px-2 py-1 shadow-command backdrop-blur">
            <button
              type="button"
              className={`h-8 w-8 rounded-full border text-sm font-bold transition ${canZoomOut ? "border-command-cyan/35 bg-command-card text-command-cyan hover:border-command-cyan hover:text-command-text" : "cursor-not-allowed border-command-line bg-command-card/70 text-command-subtle opacity-55"}`}
              data-testid="map-zoom-out"
              aria-label="Zoom out Singapore map"
              title="Zoom out"
              disabled={!canZoomOut}
              onClick={() => updateZoom(zoom - zoomStep)}
            >
              -
            </button>
            <span className="min-w-12 text-center text-xs font-semibold text-command-muted" data-testid="map-zoom-percent">{Math.round((zoom / defaultZoom) * 100)}%</span>
            <button
              type="button"
              className={`h-8 w-8 rounded-full border text-sm font-bold transition ${canZoomIn ? "border-command-cyan/35 bg-command-card text-command-cyan hover:border-command-cyan hover:text-command-text" : "cursor-not-allowed border-command-line bg-command-card/70 text-command-subtle opacity-55"}`}
              data-testid="map-zoom-in"
              aria-label="Zoom in Singapore map"
              title="Zoom in"
              disabled={!canZoomIn}
              onClick={() => updateZoom(zoom + zoomStep)}
            >
              +
            </button>
            <button
              type="button"
              className="rounded-full border border-[#FFD54A]/35 bg-command-card px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#FFD54A] hover:border-[#FFD54A]"
              data-testid="map-zoom-reset"
              title="Reset map view"
              onClick={resetMapView}
            >
              Reset
            </button>
          </div>
          <div className="absolute right-3 top-14 z-40 rounded-full border border-command-line bg-command-bg/60 px-3 py-1 text-[0.63rem] font-semibold uppercase tracking-[0.14em] text-command-muted backdrop-blur" data-testid="map-wheel-zoom-affordance">
            Scroll to zoom map - Drag to pan - Click zones or pins
          </div>

          {mapStatusBadge ? (
            <div
              className="absolute left-3 top-3 z-30 rounded-full border border-command-line bg-command-bg/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-command-muted backdrop-blur"
              data-testid="map-status-badge"
              data-top-left-map-status-badge="single"
            >
              {mapStatusBadge}
            </div>
          ) : null}

          {hqSelected ? (
            <div className="absolute left-3 bottom-20 z-40 max-w-xs rounded-2xl border border-[#FFD54A]/35 bg-command-bg/82 p-3 text-sm shadow-command backdrop-blur" data-testid="map-hq-tooltip">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFD54A]">LIMM Works HQ</p>
              <p className="mt-1 font-semibold text-command-text">Postal: 228397</p>
              <p className="mt-1 text-command-muted">Office base marker only. Not a lead pin.</p>
            </div>
          ) : null}

          {selectedPin ? (
            <div className="absolute left-3 bottom-20 z-40 max-w-sm rounded-2xl border border-command-cyan/35 bg-command-bg/84 p-3 text-sm shadow-command backdrop-blur" data-testid="map-pin-summary">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-cyan">Selected Pin</p>
              <p className="mt-1 font-semibold text-command-text">{selectedPin.label}</p>
              <p className="mt-1 text-command-muted">{selectedPin.area} - {selectedPin.description}</p>
              {selectedPin.href ? (
                <a href={selectedPin.href} className="mt-3 inline-flex rounded-xl border border-command-cyan/45 bg-command-cyan/10 px-3 py-2 text-xs font-semibold text-command-cyan hover:border-command-cyan">
                  Open item
                </a>
              ) : null}
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

        {showLocationHelper ? (
          <p className="mt-2 text-xs leading-5 text-command-muted/70" data-testid="map-location-helper">
            Add property area or postal code to activate location intelligence.
          </p>
        ) : null}

        <div className="map-area-summary-panel mt-5 rounded-2xl border border-command-line bg-command-bg/55 p-4" data-testid="map-area-summary-panel">
          {selectedPin ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center" data-testid="map-inspector-pin">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-command-cyan">Selected Pin</p>
                <h3 className="mt-1 text-2xl font-semibold text-command-text">{selectedPin.label}</h3>
                <p className="mt-2 text-sm text-command-muted">{selectedPin.type.replace(/_/g, " ")} - {selectedPin.area}</p>
                <p className="mt-1 text-sm text-command-muted">{selectedPin.description}</p>
              </div>
              {selectedPin.href ? (
                <a href={selectedPin.href} className="w-fit rounded-xl border border-command-cyan/45 bg-command-cyan/10 px-3 py-2 text-sm font-semibold text-command-cyan hover:border-command-cyan">
                  Open item
                </a>
              ) : null}
            </div>
          ) : hqSelected ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center" data-testid="map-inspector-hq">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#FFD54A]">HQ Marker</p>
                <h3 className="mt-1 text-2xl font-semibold text-command-text">LIMM HQ</h3>
                <p className="mt-2 text-sm text-command-muted">Postal: 228397</p>
                <p className="mt-1 text-sm text-command-muted">Office base marker only. Not a lead pin.</p>
              </div>
            </div>
          ) : inspectedArea ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-command-cyan">
                  {selectedAreaSummary ? "Selected Area" : "Priority Area"}
                </p>
                <h3 className="mt-1 text-2xl font-semibold text-command-text">Area: {inspectedArea.area}</h3>
                <div className="mt-3 grid gap-2 text-sm text-command-muted sm:grid-cols-3 xl:grid-cols-6">
                  <p>Active leads: <strong className="text-command-text">{inspectedArea.leadCount}</strong></p>
                  <p>Hot leads: <strong className="text-command-text">{inspectedArea.hotLeadCount}</strong></p>
                  <p>Follow-up due: <strong className="text-command-text">{inspectedArea.followUpDueCount}</strong></p>
                  <p>Appointments: <strong className="text-command-text">{inspectedArea.appointmentCount}</strong></p>
                  <p>Collections: <strong className="text-command-text">{inspectedArea.collectionDueCount}</strong></p>
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
