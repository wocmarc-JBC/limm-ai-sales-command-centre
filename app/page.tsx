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
import { getWhatsAppRuntime } from "@/lib/whatsapp-config";

function statusText(ok: boolean, enabled = "Online", disabled = "Check") {
  return ok ? enabled : disabled;
}

function MissionCard({ label, value, detail, tone = "gold" }: { label: string; value: number; detail: string; tone?: "gold" | "cyan" | "green" | "amber" }) {
  const accent = {
    gold: "from-command-gold/70 to-command-yellow/30 text-command-yellow",
    cyan: "from-command-cyan/70 to-command-blue/20 text-command-cyan",
    green: "from-command-green/70 to-command-cyan/20 text-command-green",
    amber: "from-command-amber/75 to-command-gold/20 text-command-yellow"
  }[tone];
  return (
    <article className="mission-panel group relative overflow-hidden rounded-2xl p-5 transition hover:-translate-y-0.5 hover:shadow-glow">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-command-muted">{label}</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-command-text">{value}</p>
        </div>
        <span className="mt-1 h-3 w-3 rounded-full bg-command-cyan shadow-[0_0_18px_rgba(34,211,238,0.8)]" />
      </div>
      <p className="mt-3 text-sm leading-6 text-command-muted">{detail}</p>
    </article>
  );
}

function CommandLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-text transition hover:border-command-cyan/70 hover:bg-command-cyan/10"
    >
      {children}
    </a>
  );
}

export default async function DashboardPage() {
  const [leads, followUps, settings] = await Promise.all([
    listLeads(),
    listFollowUps(),
    getSettingsSummary()
  ]);
  const whatsapp = getWhatsAppRuntime();
  const handoff = getHandoffEmailRuntime();

  const hotLeads = leads.filter((lead) => lead.leadCategory === "Hot" || calculateLeadLevel(lead) === "Gold Lead");
  const appointmentRequests = leads.filter((lead) => lead.status === "Ready To Book" || lead.status === "Appointment Pending" || /appointment|site visit|meet|slot/i.test(lead.lastClientMessage));
  const followUpDue = followUps.filter((item) => item.status !== "Scheduled");
  const botPaused = leads.filter((lead) => lead.botPaused);
  const needsMarcus = leads.filter((lead) => lead.needsMarcus || lead.bossApprovalNeeded);
  const floorPlansReceived = leads.filter((lead) => !lead.missingInfo.includes("floor_plan") && /whatsapp|web/i.test(lead.source));

  const actionQueue = leads
    .map((lead) => ({ lead, next: getNextBestAction(lead) }))
    .filter(({ lead, next }) => lead.needsMarcus || lead.bossApprovalNeeded || next.urgency === "High" || lead.status === "Follow Up Due" || lead.botPaused)
    .sort((a, b) => ({ High: 3, Medium: 2, Low: 1 }[b.next.urgency] - { High: 3, Medium: 2, Low: 1 }[a.next.urgency]))
    .slice(0, 5);

  const recentWhatsappLeads = leads
    .filter((lead) => /whatsapp/i.test(lead.source))
    .slice(0, 3);

  const missionCards = [
    { label: "Needs Marcus", value: needsMarcus.length, detail: "Approval, takeover, or risk items", tone: "gold" as const },
    { label: "Hot Leads", value: hotLeads.length, detail: "High-value opportunities to review", tone: "cyan" as const },
    { label: "Appointment Requests", value: appointmentRequests.length, detail: "Availability checks, not confirmations", tone: "amber" as const },
    { label: "Floor Plans Received", value: floorPlansReceived.length, detail: "Leads with drawings ready to inspect", tone: "green" as const },
    { label: "Follow-Up Due", value: followUpDue.length, detail: "Clients waiting for a response", tone: "amber" as const },
    { label: "Bot Paused", value: botPaused.length, detail: "Human takeover or manual pause", tone: "cyan" as const }
  ];

  return (
    <>
      <PageHeader title="LIMM Mission Control" eyebrow="Today's command priority">
        <CommandLink href="/settings#test-lead-cleanup">Clean Test Leads</CommandLink>
        <CommandLink href="/reports">View QA Report</CommandLink>
        <CommandLink href="/settings">Settings</CommandLink>
      </PageHeader>

      <section className="mission-panel relative overflow-hidden rounded-3xl p-6 md:p-8">
        <div className="absolute right-8 top-8 hidden h-40 w-40 rounded-full border border-command-cyan/30 radar-ring opacity-80 lg:block" />
        <div className="relative max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-command-cyan">Mission Control Cockpit</p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight text-command-text md:text-5xl">What must Marcus do now?</h2>
          <p className="mt-4 text-lg leading-8 text-command-muted">
            A compact live command deck for high-priority leads, WhatsApp follow-up, files received, appointment checks, and Ready for Quotation Review handoffs. Deep QA and diagnostics stay in Settings and Reports.
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {missionCards.map((card) => (
          <MissionCard key={card.label} {...card} />
        ))}
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.75fr)]">
        <div className="mission-panel rounded-2xl p-5 md:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Main Action Queue</p>
              <h3 className="mt-1 text-2xl font-semibold text-command-text">Next best moves</h3>
            </div>
            <CommandLink href="/leads">Open Lead Inbox</CommandLink>
          </div>

          <div className="mt-5 space-y-3">
            {actionQueue.length ? actionQueue.map(({ lead, next }) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="block rounded-2xl border border-command-line bg-command-bg/55 p-5 transition hover:border-command-cyan/70 hover:bg-command-cyan/10"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xl font-semibold text-command-text">{formatLeadDisplayName(lead)}</p>
                    <p className="mt-1 text-base text-command-muted">{leadSubtitle(lead)}</p>
                  </div>
                  <span className="inline-flex w-fit rounded-full border border-command-line px-3 py-1 text-sm text-command-muted">
                    {next.urgency} urgency
                  </span>
                </div>
                <p className="mt-4 text-lg font-semibold text-command-text">{next.action}</p>
                <p className="mt-1 text-base leading-7 text-command-muted">{next.reason}</p>
              </Link>
            )) : (
              <div className="rounded-2xl border border-command-line bg-command-bg/55 p-5 text-command-muted">
                No urgent mission right now. Check recent WhatsApp leads or Reports if you want a deeper scan.
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-5">
          <section className="mission-panel rounded-2xl p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">System Core</p>
            <div className="mt-4 space-y-3 text-base">
              {[
                ["WhatsApp", statusText(whatsapp.liveInboundEnabled && whatsapp.credentialsReady, "Online", "Check env")],
                ["Supabase", settings.health.mode === "Supabase Mode" ? "Live" : "Mock"],
                ["Bot", whatsapp.testAutoReplyEnabled ? "Active" : "Paused"],
                ["Email handoff", handoff.configured ? "Configured" : "Skipped"]
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 rounded-xl border border-command-line bg-command-bg/45 px-4 py-3">
                  <span className="text-command-muted">{label}</span>
                  <span className="flex items-center gap-2 font-semibold text-command-text">
                    <span className="h-2.5 w-2.5 rounded-full bg-command-green shadow-[0_0_14px_rgba(34,197,94,0.75)]" />
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="mission-panel rounded-2xl p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Quick Actions</p>
            <div className="mt-4 grid gap-3">
              <CommandLink href="/settings#test-lead-cleanup">Clean Test Leads</CommandLink>
              <CommandLink href="/reports">Reports</CommandLink>
              <CommandLink href="/settings">Settings</CommandLink>
              <CommandLink href="/audit-log">Audit Log</CommandLink>
            </div>
          </section>
        </aside>
      </section>

      <section className="mt-8 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Recent WhatsApp Leads</p>
            <h3 className="mt-1 text-2xl font-semibold text-command-text">Clean client view</h3>
          </div>
          <CommandLink href="/leads?show_test=true">Show Test Leads</CommandLink>
        </div>
        <div className="grid gap-5">
          {(recentWhatsappLeads.length ? recentWhatsappLeads : leads.slice(0, 3)).map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      </section>
    </>
  );
}
