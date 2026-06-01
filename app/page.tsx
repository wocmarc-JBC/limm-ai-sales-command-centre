import { LeadCard } from "@/components/LeadCard";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { listApprovalRequests } from "@/lib/data/approvals-repository";
import { getSystemHealth } from "@/lib/data/data-source";
import { listFollowUps } from "@/lib/data/followups-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { listQuotationReadinessRows } from "@/lib/data/quotation-repository";
import { getNextBestAction } from "@/lib/next-best-action";
import { buildMissionQueue, calculateLeadLevel } from "@/lib/sales-control";

export default async function DashboardPage() {
  const [leads, approvalRequests, followUps, quotationRows] = await Promise.all([
    listLeads(),
    listApprovalRequests(),
    listFollowUps(),
    listQuotationReadinessRows()
  ]);
  const health = getSystemHealth();
  const hotLeads = leads.filter((lead) => lead.leadCategory === "Hot");
  const waitingReply = leads.filter((lead) => !lead.lastReplyAt);
  const readyToBook = leads.filter((lead) => lead.status === "Ready To Book");
  const approvalNeeded = leads.filter((lead) => lead.bossApprovalNeeded);
  const quotationNeeded = quotationRows.filter((row) => row.readiness.bossReviewRequired);
  const noReply = leads.filter((lead) => lead.status === "Awaiting Client");
  const missionQueue = buildMissionQueue(leads, followUps);
  const goldLeads = leads.filter((lead) => calculateLeadLevel(lead) === "Gold Lead");
  const todayActions = leads
    .map((lead) => ({ lead, next: getNextBestAction(lead) }))
    .sort((a, b) => ({ High: 3, Medium: 2, Low: 1 }[b.next.urgency] - { High: 3, Medium: 2, Low: 1 }[a.next.urgency]))
    .slice(0, 4);

  return (
    <>
      <PageHeader title="Marcus Gold Command Centre" eyebrow="Today's Missions">
        <div className="rounded-lg border border-command-line bg-command-card px-4 py-2 text-sm text-command-muted">
          {health.mode} | Reply-only WhatsApp posture
        </div>
      </PageHeader>

      <section className="rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Today&apos;s Missions</p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight text-command-text">What Marcus should clear first</h2>
            <p className="mt-2 max-w-3xl text-base text-command-muted">
              Hot leads, appointment requests, floor-plan follow-ups, paused bots, and Marcus-review items are lifted to the top.
            </p>
          </div>
          <div className="rounded-lg border border-command-gold/50 bg-command-gold/10 px-4 py-3 text-command-yellow">
            {approvalNeeded.length + followUps.filter((item) => item.status !== "Scheduled").length} urgent checks
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {todayActions.map(({ lead, next }) => (
            <div key={lead.id} className="rounded-lg border border-command-line bg-command-elevated p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-command-text">{lead.clientName}</p>
                  <p className="mt-1 text-base text-command-muted">{lead.propertyType} | {lead.scopeSummary}</p>
                </div>
                <span className="rounded-md border border-command-line px-3 py-1 text-sm text-command-muted">{next.urgency}</span>
              </div>
              <p className="mt-4 text-base font-semibold text-command-text">{next.action}</p>
              <p className="mt-1 text-sm text-command-muted">{next.reason}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="command-grid mt-6">
        <MetricCard label="Today's Actions" value={todayActions.length} detail="What Marcus should clear first" />
        <MetricCard label="Gold Leads" value={goldLeads.length} tone="danger" detail="Highest-value opportunities" />
        <MetricCard label="Hot Leads" value={hotLeads.length} tone="danger" detail="Needs fast boss attention" />
        <MetricCard label="Ready for Appointment" value={readyToBook.length} tone="good" detail="Appointment-ready leads" />
        <MetricCard label="Approval Needed" value={approvalRequests.length} tone="warn" detail="Risky replies and booking decisions" />
        <MetricCard label="Follow-Up Due" value={followUps.filter((item) => item.status !== "Scheduled").length} tone="warn" />
        <MetricCard label="Ready for Quotation Review" value={quotationNeeded.length} tone="warn" detail="Readiness only, no amounts" />
        <MetricCard label="System Health" value={health.mode === "Supabase Mode" ? "Live DB" : "Mock"} detail="OpenAI/WhatsApp/Calendar disabled" />
      </section>

      <section className="mt-8 rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Mission Queue</p>
            <h3 className="mt-1 text-2xl font-semibold text-command-text">Boss action radar</h3>
          </div>
          <p className="text-base text-command-muted">Lead scoring and reminders are internal only. No auto-pricing or auto-booking.</p>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(missionQueue).map(([mission, missionLeads]) => (
            <div key={mission} className="rounded-lg border border-command-line bg-command-elevated p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-command-text">{mission}</p>
                <span className="rounded-md border border-command-line px-3 py-1 text-sm text-command-muted">{missionLeads.length}</span>
              </div>
              <p className="mt-3 text-base text-command-muted">
                {missionLeads.slice(0, 3).map((lead) => lead.clientName).join(", ") || "No leads in this mission."}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-4">
          <h3 className="text-2xl font-semibold text-command-text">Lead Priority</h3>
          {leads.slice(0, 3).map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
        <aside className="rounded-lg border border-command-line bg-command-card p-5 shadow-premium">
          <h3 className="text-2xl font-semibold text-command-text">Command Answers</h3>
          <div className="mt-5 space-y-4 text-base">
            <p><span className="text-command-muted">Hot leads today:</span> {hotLeads.length ? hotLeads.map((lead) => lead.clientName).join(", ") : "None"}</p>
            <p><span className="text-command-muted">Waiting for reply:</span> {waitingReply.length}</p>
            <p><span className="text-command-muted">Appointment to confirm:</span> {readyToBook.length}</p>
            <p><span className="text-command-muted">Boss approval needed:</span> {approvalNeeded.length}</p>
            <p><span className="text-command-muted">Follow-up overdue:</span> {followUps.filter((item) => item.status === "Overdue").length}</p>
            <p><span className="text-command-muted">Quotation-ready lead:</span> {quotationNeeded.map((row) => row.lead.clientName).join(", ") || "None"}</p>
          </div>
        </aside>
      </section>
    </>
  );
}
