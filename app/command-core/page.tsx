import { PageHeader } from "@/components/PageHeader";
import { SingaporeMissionMap } from "@/components/SingaporeMissionMap";
import { StatusBadge } from "@/components/StatusBadge";
import { listFollowUps } from "@/lib/data/followups-repository";
import { listLatestLeadMessagesForInbox } from "@/lib/data/lead-messages-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { listPaymentRecords, listProjectAccounts } from "@/lib/data/sales-collection-repository";
import { formatFullPhoneForProtectedApp, formatLeadDisplayName, leadSubtitle } from "@/lib/lead-display";
import { buildLeadFacts } from "@/lib/lead-facts";
import { buildSingaporeMissionMapData } from "@/lib/mission-map";
import { isActiveProductionLeadForDailyScreens } from "@/lib/production-lead-lifecycle";
import {
  activePayments,
  overdueAmountForProject,
  quotationStatusForLead,
  salesStageForLead,
  outstandingForProject
} from "@/lib/sales-collection";
import type { FollowUp, Lead, PaymentRecord, ProjectAccount } from "@/lib/types";

type Tone = "gold" | "cyan" | "amber" | "red" | "green" | "slate";
type DecisionPriority = "critical" | "high" | "medium" | "low";

type DecisionCard = {
  title: string;
  priority: DecisionPriority;
  why: string;
  href: string;
  actionLabel: string;
};

type TimelineItem = {
  label: string;
  detail: string;
  href: string;
  bucket: "Today" | "Tomorrow" | "This Week" | "Overdue";
  tone: Tone;
};

function toneClasses(tone: Tone) {
  return {
    gold: "border-command-gold/55 bg-command-gold/10 text-command-yellow",
    cyan: "border-command-cyan/55 bg-command-cyan/10 text-command-cyan",
    amber: "border-command-amber/55 bg-command-amber/10 text-command-amber",
    red: "border-command-red/55 bg-command-red/10 text-command-red",
    green: "border-command-green/55 bg-command-green/10 text-command-green",
    slate: "border-command-line bg-command-card text-command-muted"
  }[tone];
}

function resourceCounterToneClasses(tone: Tone) {
  return {
    gold: "border-command-gold/60 text-command-yellow",
    cyan: "border-command-cyan/60 text-command-cyan",
    amber: "border-command-amber/60 text-command-amber",
    red: "border-command-red/60 text-command-red",
    green: "border-command-green/60 text-command-green",
    slate: "border-command-line text-command-muted"
  }[tone];
}

function priorityClasses(priority: DecisionPriority) {
  return {
    critical: "border-command-red/65 bg-command-red/12 text-command-red",
    high: "border-command-gold/65 bg-command-gold/12 text-command-yellow",
    medium: "border-command-cyan/55 bg-command-cyan/10 text-command-cyan",
    low: "border-command-line bg-command-card text-command-muted"
  }[priority];
}

function dotClass(tone: Tone) {
  return {
    gold: "bg-command-gold",
    cyan: "bg-command-cyan",
    amber: "bg-command-amber",
    red: "bg-command-red",
    green: "bg-command-green",
    slate: "bg-command-subtle"
  }[tone];
}

function ResourcePill({ label, value, href, tone }: { label: string; value: number; href: string; tone: Tone }) {
  return (
    <a
      href={href}
      className={`command-press flex min-w-[9.25rem] shrink-0 items-center justify-between gap-3 rounded-xl border bg-[#030914]/95 px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03),0_10px_24px_rgba(0,0,0,0.28)] transition hover:border-command-cyan/70 hover:bg-[#061524] ${resourceCounterToneClasses(tone)}`}
      data-readable-resource-card="true"
      data-resource-card-dark-counter="true"
    >
      <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-command-muted">
        <span className={`h-2 w-2 rounded-full ${dotClass(tone)}`} />
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums text-command-text">{value}</span>
    </a>
  );
}

function daysBetween(today: Date, value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((target - start) / 86400000);
}

function bucketForDate(today: Date, value: string | null | undefined): TimelineItem["bucket"] | null {
  const diff = daysBetween(today, value);
  if (diff === null) return null;
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 7) return "This Week";
  return null;
}

function buildTimelineItems({
  followUps,
  leads,
  projects,
  payments
}: {
  followUps: FollowUp[];
  leads: Lead[];
  projects: ProjectAccount[];
  payments: PaymentRecord[];
}) {
  const today = new Date();
  const items: TimelineItem[] = [];

  for (const followUp of followUps) {
    const bucket = bucketForDate(today, followUp.dueAt);
    if (!bucket) continue;
    items.push({
      label: "Follow-up due",
      detail: `${followUp.clientName} - ${followUp.followupType}`,
      href: "/followups",
      bucket,
      tone: bucket === "Overdue" ? "red" : "amber"
    });
  }

  for (const lead of leads.filter((item) => item.status === "Appointment Pending" || item.status === "Ready To Book")) {
    items.push({
      label: "Appointment requested",
      detail: formatLeadDisplayName(lead),
      href: `/leads/${lead.id}`,
      bucket: "Today",
      tone: "gold"
    });
  }

  for (const lead of leads.filter((item) => quotationStatusForLead(item) === "Sent" && item.quoteFollowUpDate)) {
    const bucket = bucketForDate(today, lead.quoteFollowUpDate);
    if (!bucket) continue;
    items.push({
      label: "Quotation follow-up",
      detail: formatLeadDisplayName(lead),
      href: `/leads/${lead.id}`,
      bucket,
      tone: "amber"
    });
  }

  for (const project of projects) {
    const projectPayments = activePayments(payments).filter((payment) => payment.projectId === project.id);
    for (const payment of projectPayments.filter((item) => item.dueDate && !item.receivedDate)) {
      const bucket = bucketForDate(today, payment.dueDate);
      if (!bucket) continue;
      items.push({
        label: bucket === "Overdue" ? "Payment overdue" : "Collection due",
        detail: `${project.clientName} - ${payment.paymentType}`,
        href: "/sales-collection",
        bucket,
        tone: bucket === "Overdue" ? "red" : "amber"
      });
    }
  }

  for (const lead of leads.filter((item) => item.botPaused).slice(0, 3)) {
    items.push({
      label: "Bot paused",
      detail: formatLeadDisplayName(lead),
      href: `/leads/${lead.id}#bot-controls`,
      bucket: "Today",
      tone: "cyan"
    });
  }

  const bucketRank = { Overdue: 0, Today: 1, Tomorrow: 2, "This Week": 3 };
  return items.sort((a, b) => bucketRank[a.bucket] - bucketRank[b.bucket]).slice(0, 14);
}

function buildDecisionCards({
  leads,
  followUps,
  projects,
  payments
}: {
  leads: Lead[];
  followUps: FollowUp[];
  projects: ProjectAccount[];
  payments: PaymentRecord[];
}) {
  const cards: DecisionCard[] = [];
  const needsMarcus = leads.find((lead) => lead.needsMarcus || lead.bossApprovalNeeded);
  const appointment = leads.find((lead) => lead.status === "Ready To Book" || lead.status === "Appointment Pending" || /appointment|site visit|meet|slot/i.test(lead.lastClientMessage));
  const floorPlan = leads.find((lead) => /floor plan|drawing|layout|photo|image|document/i.test(lead.lastClientMessage));
  const quoteFollowUp = leads.find((lead) => quotationStatusForLead(lead) === "Sent" && lead.quoteFollowUpDate);
  const overdueProject = projects.find((project) => overdueAmountForProject(project, payments) > 0);
  const risk = leads.find((lead) => lead.riskFlags.length > 0 || /hack|approval|submission|permit|wall|complaint|refund|lawyer/i.test(lead.lastClientMessage));
  const hotLead = leads.find((lead) => lead.leadCategory === "Hot" || lead.leadScore >= 70);
  const pausedBot = leads.find((lead) => lead.botPaused);
  const followUp = followUps.find((item) => item.status === "Due" || item.status === "Overdue");

  if (appointment) cards.push({ title: "Confirm appointment request", priority: "high", why: `${formatLeadDisplayName(appointment)} asked about a slot. Check availability before confirming.`, href: `/inbox?lead=${appointment.id}`, actionLabel: "Open WhatsApp Chat" });
  if (floorPlan) cards.push({ title: "Review floor plan", priority: "high", why: `${formatLeadDisplayName(floorPlan)} has plan/photo context ready for review.`, href: `/inbox?lead=${floorPlan.id}`, actionLabel: "Open WhatsApp Chat" });
  if (quoteFollowUp) cards.push({ title: "Follow up quote", priority: "medium", why: `${formatLeadDisplayName(quoteFollowUp)} has a sent quotation needing manual follow-up.`, href: `/inbox?lead=${quoteFollowUp.id}`, actionLabel: "Open WhatsApp Chat" });
  if (overdueProject) cards.push({ title: "Check overdue collection", priority: "critical", why: `${overdueProject.clientName} has overdue collection attention needed.`, href: "/sales-collection", actionLabel: "Open collection" });
  if (risk || needsMarcus) {
    const lead = risk ?? needsMarcus!;
    cards.push({ title: "Handle risk / complaint", priority: "critical", why: `${formatLeadDisplayName(lead)} needs Marcus review before any client-facing promise.`, href: `/inbox?lead=${lead.id}`, actionLabel: "Open WhatsApp Chat" });
  }
  if (hotLead) cards.push({ title: "Review hot lead", priority: "high", why: `${formatLeadDisplayName(hotLead)} is one of the highest-priority live opportunities.`, href: `/inbox?lead=${hotLead.id}`, actionLabel: "Open WhatsApp Chat" });
  if (pausedBot) cards.push({ title: "Pause/resume bot", priority: "medium", why: `${formatLeadDisplayName(pausedBot)} has bot control paused.`, href: `/leads/${pausedBot.id}#bot-controls`, actionLabel: "Review bot" });
  if (followUp) cards.push({ title: "Follow up client", priority: followUp.status === "Overdue" ? "critical" : "medium", why: `${followUp.clientName} has a ${followUp.followupType} follow-up due.`, href: "/followups", actionLabel: "Open follow-ups" });

  return cards.slice(0, 7);
}

export default async function CommandCorePage() {
  const [rawLeads, followUps, projects, payments] = await Promise.all([
    listLeads({ includeTest: true }),
    listFollowUps({ status: "active", pageSize: 30 }),
    listProjectAccounts(),
    listPaymentRecords()
  ]);
  const messagesByLead = await listLatestLeadMessagesForInbox(rawLeads.map((lead) => lead.id), 6);
  const leads = rawLeads.filter((lead) => isActiveProductionLeadForDailyScreens(
    lead,
    messagesByLead.get(lead.id) ?? []
  ));

  const hotLeads = leads.filter((lead) => lead.leadCategory === "Hot" || lead.leadScore >= 70);
  const appointments = leads.filter((lead) => lead.status === "Ready To Book" || lead.status === "Appointment Pending" || /appointment|site visit|meet|slot/i.test(lead.lastClientMessage));
  const followUpsDue = followUps.filter((item) => item.status === "Due" || item.status === "Overdue");
  const quotesSent = leads.filter((lead) => quotationStatusForLead(lead) === "Sent").length;
  const wonSales = leads.filter((lead) => salesStageForLead(lead) === "Won").length || projects.length;
  const activePaymentRows = activePayments(payments);
  const collectionsDue = projects.filter((project) => outstandingForProject(project, activePaymentRows) > 0).length;
  const overdue = projects.filter((project) => overdueAmountForProject(project, activePaymentRows) > 0).length;
  const botPaused = leads.filter((lead) => lead.botPaused);
  const missionMap = buildSingaporeMissionMapData({ leads, followUps, projects, payments, activeFilter: "all" });
  const decisions = buildDecisionCards({ leads, followUps: followUpsDue, projects, payments });
  const timelineItems = buildTimelineItems({ leads, followUps: followUpsDue, projects, payments });
  const topLead = [...leads].sort((a, b) => b.leadScore - a.leadScore || Number(Boolean(b.needsMarcus || b.bossApprovalNeeded)) - Number(Boolean(a.needsMarcus || a.bossApprovalNeeded)))[0] ?? null;
  const topLeadFacts = topLead ? buildLeadFacts(topLead, messagesByLead.get(topLead.id) ?? []) : null;
  const topLeadAction = topLeadFacts ? { action: topLeadFacts.nextAction, reason: topLeadFacts.nextActionReason } : null;
  const riskCount = leads.filter((lead) => lead.riskFlags.length > 0 || /hack|approval|submission|permit|wall|complaint|refund|lawyer/i.test(lead.lastClientMessage)).length;
  const radarItems = [
    { label: "Hot Leads", count: hotLeads.length, tone: "gold" as const },
    { label: "Needs Marcus", count: leads.filter((lead) => lead.needsMarcus || lead.bossApprovalNeeded).length, tone: "red" as const },
    { label: "Follow-Ups", count: followUpsDue.length, tone: "amber" as const },
    { label: "Appointments", count: appointments.length, tone: "gold" as const },
    { label: "Bot Paused", count: botPaused.length, tone: "cyan" as const },
    { label: "Risk", count: riskCount, tone: "red" as const }
  ];

  return (
    <>
      <PageHeader title="Strategic Command Core" eyebrow="Command Core">
        <a href="/inbox" className="inline-flex min-h-10 items-center rounded-xl border border-command-cyan/35 bg-[#04101d]/90 px-3 py-2 text-sm font-semibold text-command-cyan transition hover:border-command-cyan/70 hover:bg-[#071827]">
          Open WhatsApp Inbox
        </a>
      </PageHeader>

      <section className="mission-panel mb-6 rounded-3xl border-command-cyan/25 bg-[#010712]/95 p-2 shadow-command" data-testid="command-core-resource-bar" data-resource-bar-readable-dark="true" data-command-core-final-touchup="true">
        <div className="thin-scrollbar flex gap-2 overflow-x-auto pb-1">
          <ResourcePill label="New Leads" value={leads.filter((lead) => salesStageForLead(lead) === "New Lead").length} href="/leads" tone="cyan" />
          <ResourcePill label="Hot Leads" value={hotLeads.length} href="/leads" tone="gold" />
          <ResourcePill label="Appointments" value={appointments.length} href="/appointments" tone="gold" />
          <ResourcePill label="Follow-Ups Due" value={followUpsDue.length} href="/followups" tone="amber" />
          <ResourcePill label="Quotes Sent" value={quotesSent} href="/sales-pipeline" tone="cyan" />
          <ResourcePill label="Won Sales" value={wonSales} href="/sales-collection" tone="green" />
          <ResourcePill label="Collections Due" value={collectionsDue} href="/sales-collection" tone="amber" />
          <ResourcePill label="Overdue" value={overdue} href="/sales-collection" tone="red" />
          <ResourcePill label="Bot Paused" value={botPaused.length} href="/leads" tone="slate" />
        </div>
      </section>

      <section
        className="command-core-centre-panel command-core-map-first-hero mb-6 w-full"
        data-testid="command-core-map-hero"
        data-command-core-map-first-layout="true"
        data-command-core-map-full-width-hero="true"
        data-command-core-map-dominant="true"
      >
        <section className="mission-panel command-core-operating-picture-compact relative mb-4 overflow-hidden rounded-3xl px-4 py-3" data-operating-picture-compact="true">
          <div className="cockpit-grid absolute inset-0 opacity-35" />
          <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Command Core</p>
              <h2 className="mt-1 text-2xl font-semibold text-command-text">Singapore operating picture</h2>
              <p className="mt-1 text-sm leading-6 text-command-muted">Real CRM signals only. No fake client files, project values, or external map API.</p>
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-[42rem] lg:justify-end">
              {radarItems.map((item) => (
                <div key={item.label} className="inline-flex min-w-[8.5rem] items-center justify-between gap-3 rounded-xl border border-command-line bg-command-bg/75 px-3 py-2">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-command-muted">
                    <span className={`h-2 w-2 rounded-full ${dotClass(item.tone)}`} />
                    {item.label}
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-command-text">{item.count}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <div
          className="command-core-map-module w-full min-w-0 [&_.singapore-map-wide-layout]:w-full [&_.singapore-map-wide-layout]:p-2 [&_.singapore-map-wide-layout]:md:p-3 [&_.singapore-map-wide-layout]:lg:p-4 [&_.singapore-tactical-map]:min-h-[34rem] [&_.singapore-tactical-map]:md:min-h-[42rem]"
          data-testid="command-core-map-module"
          data-map-uses-full-panel-width="true"
          data-map-same-size-as-dashboard="true"
        >
          <SingaporeMissionMap data={missionMap} />
        </div>
      </section>

      <section className="command-core-panels-below-map grid items-stretch gap-5 lg:grid-cols-2 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.1fr)]" data-testid="command-core-panels-below-map" data-side-panels-no-longer-squeeze-map="true" data-bottom-panels-aligned="true">
        <aside className="mission-panel h-full rounded-3xl p-4" data-testid="marcus-decisions-panel" data-command-core-side-panel="decisions-below-map">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Marcus Decisions</p>
          <h2 className="mt-1 text-2xl font-semibold text-command-text">What needs a call?</h2>
          <div className="mt-5 space-y-3">
            {decisions.length ? decisions.map((decision) => (
              <a key={`${decision.title}-${decision.href}`} href={decision.href} className="block rounded-2xl border border-command-line bg-command-bg/55 p-3 transition hover:border-command-gold/70 hover:bg-command-gold/10">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${priorityClasses(decision.priority)}`}>
                  {decision.priority}
                </span>
                <h3 className="mt-3 text-lg font-semibold text-command-text">{decision.title}</h3>
                <p className="mt-2 text-sm leading-6 text-command-muted">{decision.why}</p>
                <span className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-command-line px-3 py-2 text-sm font-semibold text-command-text">
                  {decision.actionLabel}
                </span>
              </a>
            )) : (
              <div className="rounded-2xl border border-command-line bg-command-bg/55 p-4 text-command-muted">
                All clear. No urgent decisions right now.
              </div>
            )}
          </div>
        </aside>

        <aside className="mission-panel h-full rounded-3xl p-4" data-testid="command-core-inspector-panel" data-command-core-side-panel="inspector-below-map">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Inspector</p>
          {topLead && topLeadAction ? (
            <div className="mt-4">
              <p className="text-sm text-command-muted">Top Lead Inspector</p>
              <h2 className="mt-1 text-2xl font-semibold text-command-text">{formatLeadDisplayName(topLead)}</h2>
              <p className="mt-1 text-base font-semibold text-command-cyan">{formatFullPhoneForProtectedApp(topLead.phone)}</p>
              <p className="mt-3 text-sm leading-6 text-command-muted">{leadSubtitle(topLead)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge label={topLead.status} />
                <StatusBadge label={topLead.leadCategory} />
                {topLead.botPaused ? <StatusBadge label="Bot Paused" /> : null}
              </div>
              <div className="mt-5 rounded-2xl border border-command-line bg-command-bg/55 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-gold">Next action</p>
                <p className="mt-2 text-lg font-semibold text-command-text">{topLeadAction.action}</p>
                <p className="mt-2 text-sm leading-6 text-command-muted">{topLeadAction.reason}</p>
              </div>
              <div className="mt-4 grid gap-3">
                <p className="text-sm text-command-muted">Missing info: <strong className="text-command-text">{topLeadFacts?.missingFields.length ? topLeadFacts.missingFields.join(", ") : "None flagged"}</strong></p>
                <p className="text-sm text-command-muted">Risk: <strong className="text-command-text">{topLead.riskFlags.length ? topLead.riskFlags.join(", ") : "No major risk"}</strong></p>
                <p className="text-sm text-command-muted">Lead heat: <strong className="text-command-text">{topLead.leadScore}%</strong></p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <a href={`/inbox?lead=${topLead.id}`} className="command-press inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black transition hover:bg-command-goldHover">
                  Open WhatsApp Chat
                </a>
                <a href={`/leads/${topLead.id}`} className="command-press inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-bg/55 px-4 py-2 text-base font-semibold text-command-text transition hover:border-command-gold/60">
                  View Lead Details
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-command-line bg-command-bg/55 p-5 text-command-muted">
              Select a lead, area, or mission item to inspect.
            </div>
          )}
        </aside>

        <section className="mission-panel h-full rounded-3xl p-4" data-testid="command-core-timeline-strip" data-timeline-compact="true">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-amber">Bottom Timeline</p>
              <h2 className="mt-1 text-2xl font-semibold text-command-text">Pressure by time window</h2>
            </div>
            <span className="w-fit rounded-full border border-command-line bg-command-bg/55 px-3 py-1 text-sm font-semibold text-command-muted">
              {timelineItems.length} item{timelineItems.length === 1 ? "" : "s"}
            </span>
          </div>
          {timelineItems.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(["Today", "Tomorrow", "This Week", "Overdue"] as const).map((bucket) => (
                <div key={bucket} className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
                  <p className="text-sm font-semibold text-command-text">{bucket}</p>
                  <div className="mt-3 space-y-2">
                    {timelineItems.filter((item) => item.bucket === bucket).length ? timelineItems.filter((item) => item.bucket === bucket).map((item) => (
                      <a key={`${bucket}-${item.label}-${item.detail}`} href={item.href} className={`block rounded-xl border px-3 py-2 text-sm transition hover:border-command-cyan/70 ${toneClasses(item.tone)}`}>
                        <span className="font-semibold">{item.label}</span>
                        <span className="mt-1 block text-command-muted">{item.detail}</span>
                      </a>
                    )) : (
                      <p className="rounded-xl border border-command-line bg-command-card px-3 py-2 text-sm text-command-muted">No pressure.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-command-line bg-command-bg/55 p-3 text-command-muted">
              No timeline pressure right now.
            </div>
          )}
        </section>
      </section>
    </>
  );
}
