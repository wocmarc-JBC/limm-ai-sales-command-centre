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
  if (urgent) return "border-command-red/70 bg-command-red/20 text-command-red shadow-[0_0_28px_rgba(239,68,68,0.18)]";
  if (intensity > 0.72) return "border-command-gold/70 bg-command-gold/20 text-command-yellow shadow-[0_0_28px_rgba(214,168,79,0.18)]";
  if (intensity > 0.35) return "border-command-amber/70 bg-command-amber/15 text-command-amber";
  return "border-command-cyan/55 bg-command-cyan/12 text-command-cyan";
}

export function SingaporeMissionMap({
  data,
  activeFilter = "all"
}: {
  data: MissionMapData;
  activeFilter?: MissionMapFilter;
}) {
  const priorityArea = data.areaSummaries[0] ?? null;
  const hasMapData = data.areaSummaries.length > 0 || data.pins.length > 0;

  return (
    <section className="mission-panel relative overflow-hidden rounded-3xl p-5 md:p-6" data-testid="singapore-mission-map">
      <div className="cockpit-grid absolute inset-0 opacity-40" />
      <div className="relative">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Singapore Mission Map</p>
            <h2 className="mt-1 text-3xl font-semibold text-command-text">
              {priorityArea ? `${priorityArea.area} is active` : "Area intelligence ready"}
            </h2>
            <p className="mt-2 text-sm text-command-muted">
              Hybrid area heatmap + clickable pins. Main map shows area-level context, not full addresses.
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

        <div className="relative mt-5 min-h-[22rem] overflow-hidden rounded-[2rem] border border-command-cyan/20 bg-command-bg/65">
          <div className="absolute inset-5 rounded-[48%_52%_45%_55%] border border-command-cyan/25 bg-command-cyan/5 shadow-[inset_0_0_80px_rgba(34,211,238,0.08)]" />
          <div className="absolute left-[18%] top-[20%] h-[58%] w-[65%] rotate-[-9deg] rounded-[52%_48%_42%_58%] border border-command-gold/20 bg-command-gold/5" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.12)_0_1px,transparent_2px)] [background-size:32px_32px]" />

          {hasMapData ? (
            <>
              {data.areaSummaries.map((area) => {
                const position = projectPoint(area);
                const urgent = area.overdueCount > 0 || area.riskCount > 0;
                const size = Math.round(36 + area.intensity * 44);
                return (
                  <a
                    key={area.area}
                    href={`/leads?area=${encodeURIComponent(area.area)}`}
                    className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs font-semibold transition hover:scale-105 ${heatClass(area.intensity, urgent)}`}
                    style={{ ...position, width: `${size}px`, height: `${size}px` }}
                    title={`${area.area}: ${area.leadCount} leads, ${area.wonJobCount} won, ${area.riskCount} risk`}
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
                    className={`absolute z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-command ring-4 ring-command-bg/60 transition hover:z-30 hover:scale-125 ${missionMapColorClass(pin.colorCategory)}`}
                    style={position}
                    title={`${pin.area} - ${pin.label} - ${pin.type} - ${pin.confidence === "exact" ? "Exact/manual coordinate" : "Approx. area"}`}
                  />
                );
              })}
            </>
          ) : (
            <div className="absolute inset-x-6 top-1/2 z-10 -translate-y-1/2 rounded-2xl border border-command-line bg-command-bg/80 p-5 text-center shadow-command">
              <p className="text-lg font-semibold text-command-text">Singapore Mission Map is ready.</p>
              <p className="mt-2 text-sm text-command-muted">
                Add property area or postal code to leads to see location intelligence. Unknown locations stay counted without fake pins.
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-command-gold/60 bg-command-gold/10 px-2.5 py-1 text-command-yellow">Gold = won / hot</span>
          <span className="rounded-full border border-command-cyan/60 bg-command-cyan/10 px-2.5 py-1 text-command-cyan">Cyan = active lead</span>
          <span className="rounded-full border border-command-amber/60 bg-command-amber/10 px-2.5 py-1 text-command-amber">Amber = follow-up / collection</span>
          <span className="rounded-full border border-command-red/60 bg-command-red/10 px-2.5 py-1 text-command-red">Red = urgent / overdue</span>
          <span className="rounded-full border border-command-green/60 bg-command-green/10 px-2.5 py-1 text-command-green">Green = paid / complete</span>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {data.areaSummaries.slice(0, 4).map((area) => (
            <div key={area.area} className="rounded-2xl border border-command-line bg-command-bg/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-command-text">{area.area}</p>
                  <p className="text-sm text-command-muted">{area.region} - Approx. area</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${heatClass(area.intensity, area.overdueCount > 0 || area.riskCount > 0)}`}>
                  {area.leadCount + area.wonJobCount}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-command-muted">
                <p>Leads: <strong className="text-command-text">{area.leadCount}</strong></p>
                <p>Hot: <strong className="text-command-text">{area.hotLeadCount}</strong></p>
                <p>Won: <strong className="text-command-text">{area.wonJobCount}</strong></p>
                <p>Follow-ups: <strong className="text-command-text">{area.followUpDueCount}</strong></p>
                <p>Appointments: <strong className="text-command-text">{area.appointmentCount}</strong></p>
                <p>Overdue/risk: <strong className="text-command-red">{area.overdueCount + area.riskCount}</strong></p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/leads?area=${encodeURIComponent(area.area)}`} className="rounded-xl border border-command-line bg-command-card px-3 py-2 text-sm font-semibold text-command-text hover:border-command-cyan/70">
                  View leads in area
                </Link>
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
          ))}
        </div>
      </div>
    </section>
  );
}
