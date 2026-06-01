import Link from "next/link";
import { LeadCard } from "@/components/LeadCard";
import { PageHeader } from "@/components/PageHeader";
import { listFollowUps } from "@/lib/data/followups-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { getSettingsSummary } from "@/lib/data/settings-repository";
import { getHandoffEmailRuntime } from "@/lib/handoff-email";
import { formatLeadDisplayName, leadSubtitle } from "@/lib/lead-display";
import { getNextBestAction } from "@/lib/next-best-action";
import { calculateLeadLevel } from "@/lib/sales-control";
import type { Lead } from "@/lib/types";
import { getWhatsAppRuntime } from "@/lib/whatsapp-config";

type Priority = "critical" | "high" | "medium" | "low";

type TodayItem = {
  label: string;
  priority: Priority;
  reason: string;
  actionLabel: string;
  href: string;
};

function priorityClasses(priority: Priority) {
  return {
    critical: "border-command-red/70 bg-command-red/12 text-command-red",
    high: "border-command-gold/70 bg-command-gold/12 text-command-yellow",
    medium: "border-command-cyan/55 bg-command-cyan/10 text-command-cyan",
    low: "border-command-line bg-command-card text-command-muted"
  }[priority];
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

function MarcusTodayPanel({ items }: { items: TodayItem[] }) {
  return (
    <section className="mission-panel rounded-3xl p-5 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Marcus Today</p>
          <h2 className="mt-1 text-3xl font-semibold text-command-text">Clear these first</h2>
        </div>
        <span className="w-fit rounded-full border border-command-cyan/50 bg-command-cyan/10 px-3 py-1 text-sm font-semibold text-command-cyan">
          {items.length} mission{items.length === 1 ? "" : "s"}
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

function makeLeadItem(label: string, priority: Priority, lead: Lead, actionLabel = "Open lead"): TodayItem {
  return {
    label,
    priority,
    reason: `${formatLeadDisplayName(lead)} - ${leadSubtitle(lead)}`,
    actionLabel,
    href: `/leads/${lead.id}`
  };
}

export default async function DashboardPage({ searchParams }: { searchParams?: { focus?: string } }) {
  const focusMode = searchParams?.focus === "true";
  const [leads, followUps, settings] = await Promise.all([
    listLeads(),
    listFollowUps({ status: "active", pageSize: 20 }),
    getSettingsSummary()
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

  const todayItems: TodayItem[] = [
    ...needsMarcus.slice(0, 2).map((lead) => makeLeadItem("Needs Marcus review", "critical", lead)),
    ...appointmentRequests.slice(0, 2).map((lead) => makeLeadItem("Confirm appointment request", "high", lead, "Check slot")),
    ...floorPlanReady.slice(0, 1).map((lead) => makeLeadItem("Review floor plan", "high", lead)),
    ...followUpDue.slice(0, 1).map((item) => ({
      label: "Follow up client",
      priority: "medium" as const,
      reason: `${item.clientName} - ${item.followupType}`,
      actionLabel: "Open follow-ups",
      href: "/followups"
    })),
    ...priceQuestions.slice(0, 1).map((lead) => makeLeadItem("Price question needs safe review", "high", lead)),
    ...riskQuestions.slice(0, 1).map((lead) => makeLeadItem("Hacking / approval risk", "critical", lead)),
    ...botPaused.slice(0, 1).map((lead) => makeLeadItem("Bot paused", "medium", lead, "Review bot")),
    {
      label: "Cleanup test data",
      priority: "low" as const,
      reason: "Run cleanup scan only from Settings when Marcus is ready.",
      actionLabel: "Scan cleanup",
      href: "/settings?cleanup=scan#test-lead-cleanup"
    }
  ].filter((item): item is TodayItem => Boolean(item)).slice(0, 7);

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
    { label: "Collections Due", value: 0, detail: "Accounts module on hold", priority: "low" as const },
    { label: "Bot Paused", value: botPaused.length, detail: "Human takeover active", priority: "medium" as const }
  ];

  return (
    <>
      <p className="sr-only">Marcus Command Centre Dashboard</p>
      <PageHeader title="LIMM Mission Control" eyebrow="Today's command priority">
        <span className="rounded-full border border-command-gold/50 bg-command-gold/10 px-4 py-2 text-sm font-semibold text-command-yellow">
          {priorityCount} item{priorityCount === 1 ? "" : "s"} need attention
        </span>
      </PageHeader>

      <section className="mission-panel mb-6 rounded-3xl p-4">
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

      <section className="mission-panel relative overflow-hidden rounded-3xl p-6 md:p-8">
        <div className="cockpit-grid absolute inset-0 opacity-60" />
        <div className="absolute right-8 top-8 hidden h-36 w-36 rounded-full border border-command-cyan/30 radar-ring opacity-75 lg:block" />
        <div className="relative max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-command-cyan">Command status</p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight text-command-text md:text-5xl">What must Marcus do now?</h2>
          <p className="mt-4 text-lg leading-8 text-command-muted">
            Today&apos;s command priority: {priorityCount} high-priority item{priorityCount === 1 ? "" : "s"} need attention. Pricing automation, Calendar auto-booking, and voice transcription remain off. Deep QA and diagnostics stay in Settings and Reports.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              ["WhatsApp", statusText(whatsapp.liveInboundEnabled && whatsapp.credentialsReady, "Online", "Check env"), "cyan"],
              ["Bot", whatsapp.testAutoReplyEnabled ? "Active" : "Paused", "cyan"],
              ["Supabase", settings.health.mode === "Supabase Mode" ? "Live" : "Mock", "green"],
              ["Email", handoff.configured ? "Configured" : "Pending", handoff.configured ? "green" : "amber"]
            ].map(([label, value, tone]) => (
              <span key={label} className="inline-flex items-center gap-2 rounded-full border border-command-line bg-command-bg/50 px-3 py-1.5 text-sm text-command-muted">
                <span className={`h-2.5 w-2.5 rounded-full ${tone === "green" ? "bg-command-green" : tone === "amber" ? "bg-command-amber" : "bg-command-cyan"}`} />
                {label}: <strong className="text-command-text">{value}</strong>
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-6">
        <MarcusTodayPanel items={todayItems} />
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {missionCards.map((card) => (
          <MissionCard key={card.label} {...card} />
        ))}
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
                No action queue items right now.
              </div>
            )}
          </div>
        </div>

        {!focusMode ? (
          <aside className="space-y-5">
            <section className="mission-panel rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">System Core</p>
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
