"use client";

import dynamic from "next/dynamic";
import type { MissionMapData, MissionMapFilter } from "@/lib/mission-map";

function CommandCoreMapLoadingState() {
  return (
    <div className="relative min-h-[34rem] overflow-hidden rounded-3xl border border-command-cyan/20 bg-[#020a14] p-4 md:min-h-[42rem]" role="status" aria-label="Loading interactive Singapore mission map" data-testid="command-core-map-loading">
      <div className="cockpit-grid absolute inset-0 opacity-30" aria-hidden="true" />
      <div className="relative flex items-center justify-between gap-4 border-b border-command-line/70 pb-4">
        <div>
          <div className="skeleton-shimmer relative h-3 w-32 overflow-hidden rounded-full bg-command-elevated" />
          <div className="skeleton-shimmer relative mt-3 h-7 w-56 max-w-[65vw] overflow-hidden rounded-lg bg-command-elevated" />
        </div>
        <div className="skeleton-shimmer relative h-10 w-24 overflow-hidden rounded-xl bg-command-elevated" />
      </div>
      <div className="relative mt-5 flex min-h-[25rem] items-center justify-center rounded-2xl border border-command-line/70 bg-command-bg/80 md:min-h-[32rem]">
        <div className="absolute h-[58%] w-[76%] rounded-[45%] border border-command-cyan/20 bg-command-cyan/[0.03] shadow-[0_0_80px_rgba(74,199,215,0.08)]" aria-hidden="true" />
        <div className="relative text-center">
          <span className="mx-auto block h-2.5 w-2.5 rounded-full bg-command-gold shadow-[0_0_18px_rgba(221,179,93,0.6)]" aria-hidden="true" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-command-muted">Preparing live operating picture</p>
        </div>
      </div>
    </div>
  );
}

const InteractiveSingaporeMissionMap = dynamic(
  () => import("@/components/SingaporeMissionMap").then((module) => module.SingaporeMissionMap),
  {
    ssr: false,
    loading: CommandCoreMapLoadingState
  }
);

export function CommandCoreMissionMap({
  data,
  activeFilter = "all",
  selectedArea = ""
}: {
  data: MissionMapData;
  activeFilter?: MissionMapFilter;
  selectedArea?: string;
}) {
  return <InteractiveSingaporeMissionMap data={data} activeFilter={activeFilter} selectedArea={selectedArea} />;
}
