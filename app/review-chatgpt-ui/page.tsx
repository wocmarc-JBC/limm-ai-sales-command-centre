import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { defaultAppointmentSettings, findAppointmentSlots } from "@/lib/appointment-engine";
import { approvalRequests, auditLogs, followUps, mockLeads, quotationRows } from "@/lib/mock-data";
import { isReviewRouteEnabled } from "@/lib/review-route";
import type { Lead } from "@/lib/types";
import { notFound } from "next/navigation";

// Temporary ChatGPT UI review route. Disabled unless NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=true.
// It uses mock data only, has no forms, and must not import live repositories or write actions.

const demoNames = ["Demo Landed Lead", "Demo Condo Lead", "Demo Commercial Lead", "Demo Carpentry Lead"];
const demoPhones = ["+65 DEMO 0001", "+65 DEMO 0002", "+65 DEMO 0003", "+65 DEMO 0004"];

function demoLead(lead: Lead, index: number): Lead {
  return {
    ...lead,
    clientName: demoNames[index] ?? `Demo Lead ${index + 1}`,
    phone: demoPhones[index] ?? "+65 DEMO 0000"
  };
}

function DisabledAction({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled
      className="cursor-not-allowed rounded border border-command-line bg-command-bg px-3 py-2 text-sm font-semibold text-command-muted opacity-70"
    >
      {children} (Preview Only)
    </button>
  );
}

function Section({
  id,
  title,
  children
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded border border-command-line bg-command-panel p-5 shadow-command">
      <h3 className="text-lg font-semibold text-command-text">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MiniLeadCard({ lead }: { lead: Lead }) {
  return (
    <article className="rounded border border-command-line bg-command-panel2 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-command-text">{lead.clientName}</p>
            <StatusBadge label={lead.leadCategory} />
            <StatusBadge label={lead.status} />
          </div>
          <p className="mt-1 text-sm text-command-muted">
            {lead.phone} | {lead.source} | {lead.division}
          </p>
        </div>
        <div className="rounded border border-command-line bg-command-bg px-3 py-2 text-right">
          <p className="text-xs text-command-muted">Score</p>
          <p className="text-xl font-semibold text-command-text">{lead.leadScore}</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-command-muted">Property</dt><dd>{lead.propertyType}</dd></div>
        <div><dt className="text-command-muted">Scope</dt><dd>{lead.scopeSummary}</dd></div>
        <div><dt className="text-command-muted">Missing Info</dt><dd>{lead.missingInfo.join(", ") || "None"}</dd></div>
        <div><dt className="text-command-muted">Next Action</dt><dd>{lead.aiRecommendedNextAction}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <DisabledAction>Approve Reply</DisabledAction>
        <DisabledAction>Request More Info</DisabledAction>
        <DisabledAction>Offer Appointment</DisabledAction>
        <DisabledAction>Book Appointment</DisabledAction>
        <DisabledAction>Move to Quotation Readiness</DisabledAction>
        <DisabledAction>Mark Not Suitable</DisabledAction>
        <DisabledAction>Send Follow-Up</DisabledAction>
      </div>
    </article>
  );
}

export default function ChatGptUiReviewPage() {
  if (!isReviewRouteEnabled()) {
    notFound();
  }

  const leads = mockLeads.map(demoLead);
  const primaryLead = leads[0];
  const settings = defaultAppointmentSettings;
  const sunday = settings.days.sunday;
  const sundayEnabledSettings = {
    ...settings,
    days: {
      ...settings.days,
      sunday: {
        ...settings.days.sunday,
        enabled: true
      }
    }
  };
  const sundayPreviewSlots = findAppointmentSlots(sundayEnabledSettings, "site_discussion", "2026-05-31", 1)
    .filter((slot) => slot.day === "sunday" && new Date(`${slot.date}T00:00:00`).getDay() === 0)
    .slice(0, 3);
  const readyRows = quotationRows.map((row, index) => ({
    lead: demoLead(row.lead, index),
    readiness: row.readiness
  }));

  return (
    <>
      <PageHeader title="ChatGPT UI Review" eyebrow="Temporary route">
        <div className="rounded border border-command-amber/60 bg-command-amber/10 px-4 py-2 text-sm font-semibold text-command-amber">
          Temporary ChatGPT UI Review Mode — Mock Data — No Live Actions
        </div>
      </PageHeader>

      <div className="mb-6 rounded border border-command-cyan/50 bg-command-cyan/10 p-4 text-sm text-command-text">
        This route is a read-only UI preview for external review through a temporary tunnel. It uses demo data only,
        exposes no secrets, and all visible actions are disabled.
      </div>

      <nav className="mb-6 flex gap-2 overflow-x-auto pb-2 text-sm text-command-muted">
        {[
          ["#dashboard", "Dashboard"],
          ["#lead-inbox", "Lead Inbox"],
          ["#lead-detail", "Lead Detail"],
          ["#appointment-settings", "Appointment Settings"],
          ["#approvals", "Boss Approval"],
          ["#followups", "Follow-Ups"],
          ["#quotation-readiness", "Quotation Readiness"],
          ["#client-files", "Client Files"],
          ["#system-health", "System Health"],
          ["#audit-log", "Audit Log"]
        ].map(([href, label]) => (
          <a key={href} href={href} className="whitespace-nowrap rounded border border-command-line bg-command-panel px-3 py-2">
            {label}
          </a>
        ))}
      </nav>

      <div className="space-y-6">
        <Section id="dashboard" title="Dashboard">
          <div className="command-grid">
            <MetricCard label="New Enquiries" value={leads.length} detail="Demo leads only" />
            <MetricCard label="Hot Leads" value={leads.filter((lead) => lead.leadCategory === "Hot").length} tone="danger" />
            <MetricCard label="Ready to Book" value={leads.filter((lead) => lead.status === "Ready To Book").length} tone="good" />
            <MetricCard label="Boss Approval Needed" value={leads.filter((lead) => lead.bossApprovalNeeded).length} tone="warn" />
            <MetricCard label="Follow-Ups Due" value={followUps.filter((item) => item.status === "Due").length} tone="warn" />
            <MetricCard label="Ready for Quotation Review" value={readyRows.filter((row) => row.readiness.bossReviewRequired).length} tone="warn" detail="Readiness only, no amounts" />
          </div>
        </Section>

        <Section id="lead-inbox" title="Lead Inbox">
          <div className="space-y-4">
            {leads.map((lead) => <MiniLeadCard key={lead.id} lead={lead} />)}
          </div>
        </Section>

        <Section id="lead-detail" title="Lead Detail Preview">
          <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
            <div className="rounded border border-command-line bg-command-panel2 p-4">
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={primaryLead.leadCategory} />
                <StatusBadge label={primaryLead.status} />
                {primaryLead.bossApprovalNeeded ? <StatusBadge label="Boss Approval Needed" /> : null}
              </div>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-command-muted">Client</dt><dd>{primaryLead.clientName}</dd></div>
                <div><dt className="text-command-muted">Phone / Source</dt><dd>{primaryLead.phone} | {primaryLead.source}</dd></div>
                <div><dt className="text-command-muted">Division</dt><dd>{primaryLead.division}</dd></div>
                <div><dt className="text-command-muted">Property Type</dt><dd>{primaryLead.propertyType}</dd></div>
                <div className="sm:col-span-2"><dt className="text-command-muted">Scope Summary</dt><dd>{primaryLead.scopeSummary}</dd></div>
                <div className="sm:col-span-2"><dt className="text-command-muted">AI Recommended Next Action</dt><dd>{primaryLead.aiRecommendedNextAction}</dd></div>
              </dl>
            </div>
            <aside className="rounded border border-command-line bg-command-panel2 p-4">
              <p className="text-sm text-command-muted">Appointment readiness</p>
              <p className="text-3xl font-semibold">{primaryLead.appointmentReadiness}%</p>
              <p className="mt-4 text-sm text-command-muted">Quotation readiness</p>
              <p className="text-3xl font-semibold">{primaryLead.quotationReadiness}%</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <DisabledAction>Save Status Disabled</DisabledAction>
                <DisabledAction>Boss Review Disabled</DisabledAction>
              </div>
            </aside>
          </div>
        </Section>

        <Section id="appointment-settings" title="Appointment Settings Preview">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(settings.days).map(([day, config]) => (
                <div key={day} className="rounded border border-command-line bg-command-panel2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold capitalize">{day}</p>
                    <span className={`h-5 w-10 rounded-full border ${config.enabled ? "border-command-green bg-command-green/30" : "border-command-line bg-command-bg"}`}>
                      <span className={`block h-4 w-4 rounded-full bg-command-text transition ${config.enabled ? "ml-5" : "ml-0.5"} mt-0.5`} />
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-command-muted">{config.slots.map((slot) => `${slot.start}-${slot.end}`).join(", ")}</p>
                  <p className="mt-1 text-xs text-command-muted">{config.approvalRequired ? "Approval required by setting" : "Standard setting"}</p>
                </div>
              ))}
            </div>
            <div className="rounded border border-command-line bg-command-panel2 p-4">
              <p className="font-semibold">Sunday toggle visual</p>
              <p className="mt-2 text-sm text-command-muted">
                Current mock setting: {sunday.enabled ? "on" : "off"}. Sunday is controlled by appointment settings only.
              </p>
              <p className="mt-4 text-sm text-command-muted">Example if Marcus enables Sunday:</p>
              <div className="mt-2 space-y-2 text-sm">
                {sundayPreviewSlots.map((slot) => (
                  <div key={`${slot.date}-${slot.start}`} className="flex justify-between gap-3 border-b border-command-line pb-2">
                    <span>{slot.date} {slot.start}-{slot.end}</span>
                    <span className="text-command-amber">{slot.approvalRequired ? "approval" : "standard"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section id="approvals" title="Boss Approval Queue">
          <div className="grid gap-4 lg:grid-cols-2">
            {approvalRequests.map((request, index) => (
              <article key={request.id} className="rounded border border-command-line bg-command-panel2 p-4">
                <p className="font-semibold">{index === 0 ? "Demo landed approval" : "Demo commercial approval"}</p>
                <p className="mt-2 text-sm text-command-muted">{request.reason}</p>
                <p className="mt-3 text-sm">{request.aiRecommendation}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <DisabledAction>Approve Disabled</DisabledAction>
                  <DisabledAction>Reject Disabled</DisabledAction>
                  <DisabledAction>More Info Disabled</DisabledAction>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section id="followups" title="Follow-Up Queue">
          <div className="grid gap-3 lg:grid-cols-2">
            {followUps.map((followUp, index) => (
              <div key={followUp.id} className="rounded border border-command-line bg-command-panel2 p-4">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold">Demo Follow-Up {index + 1}</p>
                  <StatusBadge label={followUp.status} />
                </div>
                <p className="mt-2 text-sm text-command-muted">{followUp.dueAt}</p>
                <p className="mt-3 text-sm">{followUp.suggestedMessage}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <DisabledAction>Complete Disabled</DisabledAction>
                  <DisabledAction>Snooze Disabled</DisabledAction>
                  <DisabledAction>No Reply Disabled</DisabledAction>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="quotation-readiness" title="Quotation Readiness">
          <div className="grid gap-4 lg:grid-cols-2">
            {readyRows.slice(0, 2).map((row) => (
              <article key={row.lead.id} className="rounded border border-command-line bg-command-panel2 p-4">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold">{row.lead.clientName}</p>
                  <p className="text-2xl font-semibold">{row.readiness.readinessScore}%</p>
                </div>
                <p className="mt-2 text-sm text-command-muted">Boss review required: {row.readiness.bossReviewRequired ? "Yes" : "No"}</p>
                <p className="mt-2 text-sm text-command-muted">Missing: {row.readiness.missingInfo.join(", ") || "None"}</p>
                <div className="mt-4 space-y-2 text-sm">
                  {row.readiness.quotePreparationChecklist.map((item) => (
                    <div key={item.item} className="flex justify-between gap-3 border-b border-command-line pb-2">
                      <span>{item.item}</span>
                      <span className={item.status === "complete" ? "text-command-green" : "text-command-amber"}>{item.status}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm text-command-muted">Client-facing amounts are not generated in this review mode.</p>
              </article>
            ))}
          </div>
        </Section>

        <Section id="system-health" title="Settings / System Health">
          <div className="mb-4 rounded border border-command-cyan/40 bg-command-cyan/10 p-3 text-sm text-command-muted">
            Mock UI Review Mode | No Login Required | No Live Actions | Demo Data Only
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Mode", "Mock UI Review"],
              ["Supabase", "disabled for this route"],
              ["OpenAI", "disabled"],
              ["WhatsApp", "disabled"],
              ["Calendar", "disabled"],
              ["Live actions", "disabled"],
              ["Client data", "demo only"],
              ["Review route", "temporary"]
            ].map(([label, value]) => (
              <div key={label} className="rounded border border-command-line bg-command-panel2 p-3">
                <p className="text-command-muted">{label}</p>
                <p className="mt-1 font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="client-files" title="Client Files Preview">
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Floor plan", "received for demo lead"],
              ["Site photos", "missing for demo lead"],
              ["Upload link status", "preview only"],
              ["Client folder status", "mock folder only"],
              ["Real upload", "disabled"],
              ["Supabase storage", "not connected on this route"],
              ["Real client files", "not shown"],
              ["Review safety", "demo metadata only"]
            ].map(([label, value]) => (
              <div key={label} className="rounded border border-command-line bg-command-panel2 p-3">
                <p className="text-command-muted">{label}</p>
                <p className="mt-1 font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="audit-log" title="Audit Log Preview">
          <div className="space-y-3">
            {auditLogs.map((log) => (
              <div key={log.id} className="rounded border border-command-line bg-command-panel2 p-4 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-semibold">{log.action}</p>
                  <p className="text-command-muted">{log.createdAt}</p>
                </div>
                <p className="mt-2 text-command-muted">{log.summary}</p>
                <p className="mt-2 text-xs text-command-muted">{log.actorName} | {log.entityType}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
