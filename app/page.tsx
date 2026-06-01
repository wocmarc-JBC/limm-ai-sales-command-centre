import { LeadCard } from "@/components/LeadCard";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { listApprovalRequests } from "@/lib/data/approvals-repository";
import { listFollowUps } from "@/lib/data/followups-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { listQuotationReadinessRows } from "@/lib/data/quotation-repository";
import { cleanLeadDisplayName, leadSubtitle } from "@/lib/lead-display";
import { getNextBestAction } from "@/lib/next-best-action";
import { calculateLeadLevel } from "@/lib/sales-control";

export default async function DashboardPage() {
  const [leads, approvalRequests, followUps, quotationRows] = await Promise.all([
    listLeads(),
    listApprovalRequests(),
    listFollowUps(),
    listQuotationReadinessRows()
  ]);
  const hotLeads = leads.filter((lead) => lead.leadCategory === "Hot");
  const readyToBook = leads.filter((lead) => lead.status === "Ready To Book");
  const approvalNeeded = leads.filter((lead) => lead.bossApprovalNeeded);
  const quotationNeeded = quotationRows.filter((row) => row.readiness.bossReviewRequired);
  const followUpDue = followUps.filter((item) => item.status !== "Scheduled");
  const botPaused = leads.filter((lead) => lead.botPaused);
  const needsMarcus = leads.filter((lead) => lead.needsMarcus || lead.bossApprovalNeeded);
  const floorPlanNeeded = leads.filter((lead) => lead.missingInfo.includes("floor_plan") || lead.missingInfo.includes("site_photos"));
  const goldLeads = leads.filter((lead) => calculateLeadLevel(lead) === "Gold Lead");
  const todayActions = leads
    .map((lead) => ({ lead, next: getNextBestAction(lead) }))
    .sort((a, b) => ({ High: 3, Medium: 2, Low: 1 }[b.next.urgency] - { High: 3, Medium: 2, Low: 1 }[a.next.urgency]))
    .slice(0, 5);
  const bossMissions = [
    { label: "Needs Marcus", value: needsMarcus.length, detail: "Approval, risk or handover items" },
    { label: "Hot Leads", value: hotLeads.length, detail: "Highest-priority sales opportunities" },
    { label: "Appointment Requests", value: readyToBook.length, detail: "Check availability before confirming" },
    { label: "Follow-Up Due", value: followUpDue.length, detail: "Clients waiting for a nudge" },
    { label: "Bot Paused", value: botPaused.length, detail: "Human takeover active" },
    { label: "Files Needed", value: floorPlanNeeded.length, detail: "Floor plan or site photos missing" }
  ].filter((item) => item.value > 0).slice(0, 6);

  return (
    <>
      <PageHeader title="Marcus Gold Command Centre" eyebrow="Today's Missions">
        <div className="rounded-lg border border-command-line bg-command-card px-4 py-2 text-sm text-command-muted">
          Boss-first live sales view
        </div>
      </PageHeader>

      <section className="rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Today&apos;s Missions</p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight text-command-text">What Marcus should clear first</h2>
            <p className="mt-2 max-w-3xl text-base text-command-muted">
              A cleaner command view for lead review, follow-up, and appointment checks. System health and QA details live in Settings and Reports.
            </p>
          </div>
          <div className="rounded-lg border border-command-gold/50 bg-command-gold/10 px-4 py-3 text-command-yellow">
            {needsMarcus.length + followUpDue.length} priority checks
          </div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {(bossMissions.length ? bossMissions : [{ label: "Clear", value: 0, detail: "No urgent mission right now" }]).map((mission) => (
              <div key={mission.label} className="rounded-lg border border-command-line bg-command-elevated p-4">
                <p className="text-sm text-command-muted">{mission.label}</p>
                <p className="mt-1 text-3xl font-semibold text-command-text">{mission.value}</p>
                <p className="mt-2 text-sm text-command-muted">{mission.detail}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3">
          {todayActions.map(({ lead, next }) => (
            <div key={lead.id} className="rounded-lg border border-command-line bg-command-elevated p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xl font-semibold text-command-text">{cleanLeadDisplayName(lead)}</p>
                  <p className="mt-1 text-base text-command-muted">{leadSubtitle(lead)}</p>
                </div>
                <span className="rounded-md border border-command-line px-3 py-1 text-sm text-command-muted">{next.urgency}</span>
              </div>
              <p className="mt-4 text-base font-semibold text-command-text">{next.action}</p>
              <p className="mt-1 text-sm text-command-muted">{next.reason}</p>
            </div>
          ))}
          </div>
        </div>
      </section>

      <section className="command-grid mt-6">
        <MetricCard label="Gold Leads" value={goldLeads.length} tone="danger" detail="Highest-value opportunities" />
        <MetricCard label="Ready for Appointment" value={readyToBook.length} tone="good" detail="Appointment-ready leads" />
        <MetricCard label="Approval Needed" value={approvalRequests.length || approvalNeeded.length} tone="warn" detail="Risky replies and booking decisions" />
        <MetricCard label="Follow-Up Due" value={followUpDue.length} tone="warn" />
        <MetricCard label="Ready for Quotation Review" value={quotationNeeded.length} tone="warn" detail="Readiness only, no amounts" />
      </section>

      <section className="mt-8 space-y-4">
        <h3 className="text-2xl font-semibold text-command-text">Lead Priority</h3>
        {leads.slice(0, 4).map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </section>
    </>
  );
}
