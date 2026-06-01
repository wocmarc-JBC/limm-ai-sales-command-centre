import Link from "next/link";
import { LeadCard } from "@/components/LeadCard";
import { PageHeader } from "@/components/PageHeader";
import { SingaporeMissionMap } from "@/components/SingaporeMissionMap";
import { listFollowUps } from "@/lib/data/followups-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { listPaymentRecords, listProjectAccounts } from "@/lib/data/sales-collection-repository";
import { getSettingsSummary } from "@/lib/data/settings-repository";
import { getHandoffEmailRuntime } from "@/lib/handoff-email";
import { formatLeadDisplayName, leadSubtitle } from "@/lib/lead-display";
import { buildSingaporeMissionMapData, type MissionMapFilter } from "@/lib/mission-map";
import { getNextBestAction } from "@/lib/next-best-action";
import { calculateLeadLevel } from "@/lib/sales-control";
import type { Lead } from "@/lib/types";
import { getWhatsAppRuntime } from "@/lib/whatsapp-config";

type Priority = "critical" | "high" | "medium" | "low";

type TodayItem = {
  label: string;
  priority: Priority;
  reason: string;
  count?: number;
  actionLabel: string;
  href: string;
};

type RadarTone = "gold" | "cyan" | "amber" | "red" | "green" | "slate";

type RadarItem = {
  label: string;
  count: number;
  tone: RadarTone;
};

function priorityClasses(priority: Priority) {
  return {
    critical: "border-command-red/70 bg-command-red/12 text-command-red",
    high: "border-command-gold/70 bg-command-gold/12 text-command-yellow",
    medium: "border-command-cyan/55 bg-command-cyan/10 text-command-cyan",
    low: "border-command-line bg-command-card text-command-muted"
  }[priority];
}

function radarToneClasses(tone: RadarTone) {
  return {
    gold: "border-command-gold/60 bg-command-gold/12 text-command-yellow",
    cyan: "border-command-cyan/60 bg-command-cyan/10 text-command-cyan",
    amber: "border-command-amber/60 bg-command-amber/10 text-command-amber",
    red: "border-command-red/60 bg-command-red/10 text-command-red",
    green: "border-command-green/60 bg-command-green/10 text-command-green",
    slate: "border-command-line bg-command-card text-command-muted"
  }[tone];
}

function radarDotClass(tone: RadarTone) {
  return {
    gold: "bg-command-gold",
    cyan: "bg-command-cyan",
    amber: "bg-command-amber",
    red: "bg-command-red",
    green: "bg-command-green",
    slate: "bg-command-subtle"
  }[tone];
}

function statusText(ok: boolean, enabled = "Online", disabled = "Check") {
  return ok ? enabled : disabled;
}

function CompactLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-text transition hover:border-command-cyan/70 hover:bg-command-cyan/10"
    >
      {children}
    </a>
  );
}

function SystemCoreStrip({ whatsapp, supabaseMode, emailConfigured }: { whatsapp: ReturnType<typeof getWhatsAppRuntime>; supabaseMode: string; emailConfigured: boolean }) {
  const statuses = [
    { label: "WhatsApp", value: statusText(whatsapp.liveInboundEnabled && whatsapp.credentialsReady, "Online", "Check env"), tone: "cyan" as const },
    { label: "Bot", value: whatsapp.testAutoReplyEnabled ? "Active" : "Paused", tone: "cyan" as const },
    { label: "Supabase", value: supabaseMode === "Supabase Mode" ? "Live" : "Mock", tone: "green" as const },
    { label: "Email Handoff", value: emailConfigured ? "On" : "Pending", tone: emailConfigured ? "green" as const : "amber" as const }
  ];

  return (
    <section className="mission-panel mb-6 rounded-2xl px-4 py-3">
      <p className="sr-only">Compact System Core status strip</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-[0.2em] text-command-cyan">System Core</span>
        {statuses.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-2 rounded-full border border-command-line bg-command-bg/50 px-3 py-1.5 text-sm text-command-muted">
            <span className={`h-2.5 w-2.5 rounded-full ${radarDotClass(item.tone)}`} />
            {item.label}: <strong className="text-command-text">{item.value}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}

function MissionCard({ label, value, detail, priority = "medium" }: { label: string; value: number; detail: string; priority?: Priority }) {
  return (
    <article className="mission-panel relative overflow-hidden rounded-2xl p-4">
      <div className={`absolute inset-x-0 top-0 h-1 ${priority === "critical" ? "bg-command-red" : priority === "high" ? "bg-command-gold" : priority === "medium" ? "bg-command-cyan" : "bg-command-line"}`} />
      <p className="text-sm font-medium text-command-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-command-text">{value}</p>
      <p className="mt-2 text-sm leading-6 text-command-muted">{detail}</p>
    </article>
  );
}

function MissionRadarPanel({ items, primary }: { items: RadarItem[]; primary: TodayItem | null }) {
  const activeItems = items.filter((item) => item.count > 0);
  const radarBlips = activeItems.slice(0, 5);
  const blipPositions = [
    "left-1/2 top-4 -translate-x-1/2",
    "right-5 top-1/3",
    "bottom-8 right-12",
    "bottom-8 left-12",
    "left-5 top-1/3"
  ];
  const primaryCount = primary?.count ?? (primary ? 1 : 0);
  const centerStatus = primary
    ? `${primaryCount} item${primaryCount === 1 ? "" : "s"} need attention`
    : "All clear";
  const centerDetail = primary?.label ?? "No urgent queue";

  return (
    <section className="mission-panel relative overflow-hidden rounded-3xl p-5 md:p-6">
      <div className="cockpit-grid absolute inset-0 opacity-50" />
      <div className="relative">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Mission Radar</p>
            <h2 className="mt-1 text-3xl font-semibold text-command-text">{centerStatus}</h2>
          </div>
          <span className={`w-fit rounded-full border px-3 py-1 text-sm font-semibold ${primary?.priority ? priorityClasses(primary.priority) : "border-command-green/60 bg-command-green/10 text-command-green"}`}>
            {centerDetail}
          </span>
        </div>

        <div className="relative mx-auto mt-6 flex h-80 w-full max-w-[26rem] items-center justify-center rounded-full border border-command-cyan/25 radar-ring">
          <div className="absolute inset-8 rounded-full border border-command-cyan/15" />
          <div className="absolute inset-16 rounded-full border border-command-gold/20" />
          <div className="relative z-10 max-w-[13rem] rounded-3xl border border-command-line bg-command-bg/80 p-4 text-center shadow-command backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-muted">Highest Priority</p>
            <p className="mt-2 text-2xl font-semibold leading-tight text-command-text">{centerDetail}</p>
            <p className="mt-2 text-sm text-command-muted">{primary ? primary.reason : "All clear: no urgent queue"}</p>
          </div>
          {radarBlips.map((item, index) => (
            <div
              key={item.label}
              className={`absolute ${blipPositions[index]} rounded-full border px-2.5 py-1 text-xs font-semibold shadow-command ${radarToneClasses(item.tone)}`}
            >
              {item.count}
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-command-line bg-command-bg/45 px-3 py-2">
              <span className="inline-flex items-center gap-2 text-command-muted">
                <span className={`h-2.5 w-2.5 rounded-full ${radarDotClass(item.tone)}`} />
                {item.label}
              </span>
              <strong className="text-command-text">{item.count}</strong>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-command-gold/60 bg-command-gold/10 px-2.5 py-1 text-command-yellow">Gold = Hot / priority</span>
            <span className="rounded-full border border-command-cyan/60 bg-command-cyan/10 px-2.5 py-1 text-command-cyan">Cyan = system / bot</span>
            <span className="rounded-full border border-command-amber/60 bg-command-amber/10 px-2.5 py-1 text-command-amber">Amber = follow-up</span>
            <span className="rounded-full border border-command-red/60 bg-command-red/10 px-2.5 py-1 text-command-red">Red = risk</span>
            <span className="rounded-full border border-command-green/60 bg-command-green/10 px-2.5 py-1 text-command-green">Green = clear</span>
          </div>
          <a
            href={primary?.href ?? "/leads"}
            className="command-press inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black transition hover:bg-command-goldHover"
          >
            {primary?.actionLabel ?? "Open Priority Lead"}
          </a>
        </div>
      </div>
    </section>
  );
}

function MarcusTodayPanel({ items }: { items: TodayItem[] }) {
  return (
    <section className="mission-panel rounded-3xl p-5 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Marcus Today</p>
          <h2 className="mt-1 text-3xl font-semibold text-command-text">Next Best Action</h2>
          <p className="sr-only">What must Marcus do now?</p>
          <p className="sr-only">Clear these first</p>
        </div>
        <span className="w-fit rounded-full border border-command-cyan/50 bg-command-cyan/10 px-3 py-1 text-sm font-semibold text-command-cyan">
          Top {Math.min(items.length, 5)} priorit{items.length === 1 ? "y" : "ies"}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {items.length ? items.map((item) => (
          <a
            key={`${item.label}-${item.href}`}
            href={item.href}
            className="block rounded-2xl border border-command-line bg-command-bg/55 p-4 transition hover:border-command-cyan/70 hover:bg-command-cyan/10"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${priorityClasses(item.priority)}`}>
                    {item.priority}
                  </span>
                  <p className="text-lg font-semibold text-command-text">{item.label}</p>
                  {item.count !== undefined ? (
                    <span className="rounded-full border border-command-line bg-command-card px-2.5 py-1 text-xs font-semibold text-command-muted">
                      {item.count}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-base leading-7 text-command-muted">{item.reason}</p>
              </div>
              <span className="inline-flex min-h-10 w-fit items-center rounded-xl border border-command-line px-3 py-2 text-sm font-semibold text-command-text">
                {item.actionLabel}
              </span>
            </div>
          </a>
        )) : (
          <div className="rounded-2xl border border-command-line bg-command-bg/55 p-5 text-command-muted">
            All clear. No urgent action right now.
          </div>
        )}
      </div>
    </section>
  );
}

function makeLeadItem(label: string, priority: Priority, lead: Lead, actionLabel = "Open lead", count?: number): TodayItem {
  return {
    label,
    priority,
    reason: `${formatLeadDisplayName(lead)} - ${leadSubtitle(lead)}`,
    count,
    actionLabel,
    href: `/leads/${lead.id}`
  };
}

const mapFilters: MissionMapFilter[] = ["all", "leads", "hot", "won", "site_visits", "followups", "collections", "overdue"];

export default async function DashboardPage({ searchParams }: { searchParams?: { focus?: string; map?: string } }) {
  const focusMode = searchParams?.focus === "true";
  const activeMapFilter = mapFilters.includes(searchParams?.map as MissionMapFilter) ? searchParams?.map as MissionMapFilter : "all";
  const [leads, followUps, settings, projects, payments] = await Promise.all([
    listLeads(),
    listFollowUps({ status: "active", pageSize: 20 }),
    getSettingsSummary(),
    listProjectAccounts(),
    listPaymentRecords()
  ]);
  const whatsapp = getWhatsAppRuntime();
  const handoff = getHandoffEmailRuntime();

  const hotLeads = leads.filter((lead) => lead.leadCategory === "Hot" || calculateLeadLevel(lead) === "Gold Lead");
  const appointmentRequests = leads.filter((lead) => lead.status === "Ready To Book" || lead.status === "Appointment Pending" || /appointment|site visit|meet|slot|wed|tomorrow/i.test(lead.lastClientMessage));
  const followUpDue = followUps.filter((item) => item.status !== "Scheduled");
  const botPaused = leads.filter((lead) => lead.botPaused);
  const needsMarcus = leads.filter((lead) => lead.needsMarcus || lead.bossApprovalNeeded);
  const floorPlanReady = leads.filter((lead) => !lead.missingInfo.includes("floor_plan") && /floor plan|drawing|layout|attached|image|photo/i.test(lead.lastClientMessage));
  const priceQuestions = leads.filter((lead) => /how much|rough|price|budget|quotation|quote/i.test(lead.lastClientMessage));
  const riskQuestions = leads.filter((lead) => /hack|hacking|approval|submission|permit|wall|structural|refund|lawyer|complaint/i.test(lead.lastClientMessage) || lead.riskFlags.length > 0);
  const detectedTestData = leads.filter((lead) => lead.isTest).length;
  const emailHandoffPending = handoff.configured ? 0 : 1;

  const todayItems: TodayItem[] = [
    ...needsMarcus.slice(0, 2).map((lead) => makeLeadItem("Needs Marcus review", "critical", lead, "Open review", needsMarcus.length)),
    ...appointmentRequests.slice(0, 2).map((lead) => makeLeadItem("Confirm appointment request", "high", lead, "Check slot", appointmentRequests.length)),
    ...floorPlanReady.slice(0, 1).map((lead) => makeLeadItem("Review floor plan", "high", lead, "Open lead", floorPlanReady.length)),
    ...followUpDue.slice(0, 1).map((item) => ({
      label: "Follow up client",
      priority: "medium" as const,
      reason: `${item.clientName} - ${item.followupType}`,
      count: followUpDue.length,
      actionLabel: "Open follow-ups",
      href: "/followups"
    })),
    ...priceQuestions.slice(0, 1).map((lead) => makeLeadItem("Price question needs safe review", "high", lead, "Open lead", priceQuestions.length)),
    ...riskQuestions.slice(0, 1).map((lead) => makeLeadItem("Hacking / approval risk", "critical", lead, "Open lead", riskQuestions.length)),
    ...botPaused.slice(0, 1).map((lead) => makeLeadItem("Bot paused", "medium", lead, "Review bot", botPaused.length))
  ].filter((item): item is TodayItem => Boolean(item)).slice(0, 5);

  const actionQueue = leads
    .map((lead) => ({ lead, next: getNextBestAction(lead) }))
    .filter(({ lead, next }) => (
      lead.needsMarcus
      || lead.bossApprovalNeeded
      || next.urgency === "High"
      || lead.status === "Follow Up Due"
      || lead.botPaused
      || /appointment|site visit|how much|price|hack|approval|floor plan|photo/i.test(lead.lastClientMessage)
    ))
    .sort((a, b) => ({ High: 3, Medium: 2, Low: 1 }[b.next.urgency] - { High: 3, Medium: 2, Low: 1 }[a.next.urgency]))
    .slice(0, 6);

  const recentWhatsappLeads = leads.filter((lead) => /whatsapp/i.test(lead.source)).slice(0, 3);
  const priorityCount = todayItems.filter((item) => item.priority === "critical" || item.priority === "high").length;

  const missionCards = [
    { label: "Needs Marcus", value: needsMarcus.length, detail: "Boss approval, takeover, or risk", priority: "critical" as const },
    { label: "Hot Leads", value: hotLeads.length, detail: "Highest-value live opportunities", priority: "high" as const },
    { label: "Appointment Requests", value: appointmentRequests.length, detail: "Check availability before confirming", priority: "high" as const },
    { label: "Ready for Quotation Review", value: leads.filter((lead) => lead.status === "Quotation Readiness" || lead.quotationReadiness >= 70).length, detail: "Readiness only, no amounts", priority: "medium" as const },
    { label: "Follow-Up Due", value: followUpDue.length, detail: "Clients waiting for follow-up", priority: "medium" as const },
    { label: "Bot Paused", value: botPaused.length, detail: "Human takeover active", priority: "medium" as const }
  ].filter((card) => card.value > 0);
  const allClear = todayItems.length === 0 && missionCards.length === 0;
  const radarItems: RadarItem[] = [
    { label: "Hot Leads", count: hotLeads.length, tone: "gold" },
    { label: "Needs Marcus", count: needsMarcus.length, tone: "red" },
    { label: "Follow-Up Due", count: followUpDue.length, tone: "amber" },
    { label: "Appointment Requests", count: appointmentRequests.length, tone: "gold" },
    { label: "Bot Paused", count: botPaused.length, tone: "cyan" },
    { label: "Hacking / Approval Risk", count: riskQuestions.length, tone: "red" },
    { label: "Test Data Detected", count: detectedTestData, tone: "slate" },
    { label: "Email Handoff Pending", count: emailHandoffPending, tone: handoff.configured ? "green" : "amber" }
  ];
  const radarPrimary = todayItems[0] ?? null;
  const missionMap = buildSingaporeMissionMapData({ leads, followUps, projects, payments, activeFilter: activeMapFilter });

  return (
    <>
      <p className="sr-only">Marcus Command Centre Dashboard</p>
      <PageHeader title="LIMM Mission Control" eyebrow="Today's command priority">
        <span className="rounded-full border border-command-gold/50 bg-command-gold/10 px-4 py-2 text-sm font-semibold text-command-yellow">
          {priorityCount} item{priorityCount === 1 ? "" : "s"} need attention
        </span>
      </PageHeader>

      <section className="mission-panel sticky top-3 z-20 mb-6 rounded-3xl p-4 shadow-command">
        <p className="sr-only">Sticky top command bar</p>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <input
              aria-label="Search lead, phone, or scope"
              placeholder="Search lead / phone / scope"
              className="min-h-12 rounded-2xl border border-command-line bg-command-bg/70 px-4 text-base text-command-text outline-none transition placeholder:text-command-subtle focus:border-command-cyan"
            />
            <a
              href={focusMode ? "/" : "/?focus=true"}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-command-cyan/60 bg-command-cyan/10 px-4 font-semibold text-command-cyan transition hover:bg-command-cyan/15"
            >
              {focusMode ? "Full Cockpit" : "Focus Mode"}
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <CompactLink href="/settings?cleanup=scan#test-lead-cleanup">Clean Test Data</CompactLink>
            <CompactLink href="/reports">QA Centre</CompactLink>
            <CompactLink href="/settings">Settings</CompactLink>
          </div>
        </div>
      </section>

      <SystemCoreStrip whatsapp={whatsapp} supabaseMode={settings.health.mode} emailConfigured={handoff.configured} />

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)]">
        <MarcusTodayPanel items={todayItems} />
        <MissionRadarPanel items={radarItems} primary={radarPrimary} />
      </section>

      <section className="mt-6">
        <SingaporeMissionMap data={missionMap} activeFilter={activeMapFilter} />
      </section>

      <section className="mt-6">
        {missionCards.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {missionCards.map((card) => (
              <MissionCard key={card.label} {...card} />
            ))}
          </div>
        ) : (
          <div className="mission-panel rounded-2xl p-4 text-base text-command-muted">
            {allClear ? "All clear: no urgent leads, overdue follow-ups, appointment requests, or paused bots right now." : "No mission cards need attention right now."}
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,0.75fr)]">
        <div className="mission-panel rounded-2xl p-5 md:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Main Action Queue</p>
              <h3 className="mt-1 text-2xl font-semibold text-command-text">Action-first lead list</h3>
            </div>
            <CompactLink href="/leads">Open Inbox</CompactLink>
          </div>

          <div className="mt-5 space-y-3">
            {actionQueue.length ? actionQueue.map(({ lead, next }) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="block rounded-2xl border border-command-line bg-command-bg/55 p-4 transition hover:border-command-cyan/70 hover:bg-command-cyan/10"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xl font-semibold text-command-text">{formatLeadDisplayName(lead)}</p>
                    <p className="mt-1 text-base text-command-muted">{leadSubtitle(lead)}</p>
                  </div>
                  <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-sm font-semibold ${priorityClasses(next.urgency === "High" ? "high" : next.urgency === "Medium" ? "medium" : "low")}`}>
                    {next.urgency}
                  </span>
                </div>
                <p className="mt-3 text-lg font-semibold text-command-text">{next.action}</p>
                <p className="mt-1 text-base leading-7 text-command-muted">{next.reason}</p>
              </Link>
            )) : (
              <div className="rounded-2xl border border-command-line bg-command-bg/55 p-5 text-command-muted">
                Action queue clear.
              </div>
            )}
          </div>
        </div>

        {!focusMode ? (
          <aside className="space-y-5">
            <section className="mission-panel rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">System Core</p>
              <p className="sr-only">Deep QA and diagnostics stay in Settings and Reports</p>
              <div className="mt-4 space-y-3 text-base">
                {[
                  ["WhatsApp", statusText(whatsapp.liveInboundEnabled && whatsapp.credentialsReady, "Online", "Check env")],
                  ["Supabase", settings.health.mode === "Supabase Mode" ? "Live" : "Mock"],
                  ["Bot", whatsapp.testAutoReplyEnabled ? "Active" : "Paused"],
                  ["Email handoff", handoff.configured ? "Configured" : "Not configured"],
                  ["QA", "Last local checks passed"]
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 rounded-xl border border-command-line bg-command-bg/45 px-4 py-3">
                    <span className="text-command-muted">{label}</span>
                    <span className="font-semibold text-command-text">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="mission-panel rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Quick Actions</p>
              <div className="mt-4 grid gap-3">
                <CompactLink href="/settings?cleanup=scan#test-lead-cleanup">Clean Test Data</CompactLink>
                <CompactLink href="/reports">Reports</CompactLink>
                <CompactLink href="/settings">Settings</CompactLink>
                <CompactLink href="/audit-log">Audit Log</CompactLink>
              </div>
            </section>
          </aside>
        ) : null}
      </section>

      {!focusMode ? (
        <section className="mt-8 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Recent WhatsApp Leads</p>
              <h3 className="mt-1 text-2xl font-semibold text-command-text">Latest clean active leads</h3>
            </div>
            <CompactLink href="/leads?view=test">Show Test Leads</CompactLink>
          </div>
          <div className="grid gap-5">
            {recentWhatsappLeads.length ? recentWhatsappLeads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            )) : (
              <div className="mission-panel rounded-2xl p-5 text-command-muted">
                No recent WhatsApp leads in the active dashboard.
              </div>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
