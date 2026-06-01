import Link from "next/link";
import { evaluateBookingReadiness } from "@/lib/calendar-booking";
import type { Lead } from "@/lib/types";
import { humanizeLabel } from "@/lib/labels";
import { formatLeadDisplayName } from "@/lib/lead-display";
import { getNextBestAction } from "@/lib/next-best-action";
import { calculateLeadLevel } from "@/lib/sales-control";
import { matchQuestionBankIntent } from "@/lib/whatsapp-question-bank";
import { StatusBadge } from "./StatusBadge";

function snippet(text: string) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "No recent message preview.";
  return clean.length > 150 ? `${clean.slice(0, 147)}...` : clean;
}

function chips(items: string[], fallback: string) {
  const visible = items.slice(0, 3);
  if (!visible.length) return <span className="text-command-muted">{fallback}</span>;
  return visible.map((item) => (
    <span key={item} className="rounded-full border border-command-line bg-command-bg/55 px-2.5 py-1 text-xs font-semibold text-command-muted">
      {humanizeLabel(item)}
    </span>
  ));
}

export function LeadCard({ lead }: { lead: Lead }) {
  const next = getNextBestAction(lead);
  const booking = evaluateBookingReadiness({ lead, latestText: lead.lastClientMessage });
  const isWhatsapp = /whatsapp/i.test(lead.source);
  const questionMatch = isWhatsapp ? matchQuestionBankIntent(lead.lastClientMessage) : null;
  const leadLevel = lead.leadLevel ?? calculateLeadLevel(lead);
  const displayName = formatLeadDisplayName(lead);
  const scope = lead.scopeSummary || lead.serviceType || "Renovation scope pending";
  const stage = booking.appointmentIntent ? "Appointment requested" : lead.status;

  return (
    <article className="mission-panel rounded-2xl p-5 transition hover:border-command-cyan/70 hover:shadow-glow">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={leadLevel} />
            <StatusBadge label={booking.appointmentIntent ? "Appointment Requested" : stage} />
            {isWhatsapp ? <StatusBadge label="WhatsApp" /> : null}
            {lead.botPaused ? <StatusBadge label="Bot Paused" /> : null}
            {lead.needsMarcus || lead.bossApprovalNeeded ? <StatusBadge label="Needs Marcus" /> : null}
            {lead.bossApprovalNeeded ? <StatusBadge label="Boss Review Required" /> : null}
            {lead.missingInfo.some((item) => /floor_plan|site_photos/i.test(item)) ? <StatusBadge label="Needs Floor Plan / Photos" /> : null}
            {lead.isTest ? <StatusBadge label="Test Lead" /> : null}
            {lead.deletedAt ? <StatusBadge label="Soft Deleted" /> : null}
            {questionMatch && questionMatch.score > 0 && questionMatch.entry.intent_key !== "unsupported" ? <StatusBadge label={questionMatch.entry.category} /> : null}
          </div>
          <Link href={`/leads/${lead.id}`} className="mt-3 block text-2xl font-semibold leading-8 text-command-text hover:text-command-gold">
            {displayName}
          </Link>
          <p className="mt-2 text-xl font-semibold text-command-text">{scope}</p>
          <p className="mt-1 text-base text-command-muted">
            Stage: {humanizeLabel(stage)} | {lead.propertyType || "Property type pending"}
          </p>
          <p className="mt-1 text-sm text-command-subtle">Booking readiness: {humanizeLabel(booking.status)}</p>
          {questionMatch && questionMatch.score > 0 && questionMatch.entry.intent_key !== "unsupported" ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-command-subtle">
              Question category: {questionMatch.entry.category} | Reply strategy: {questionMatch.entry.safe_answer_strategy}
            </p>
          ) : null}
          {displayName !== lead.clientName ? (
            <p className="mt-1 text-sm text-command-subtle">Generated CRM title cleaned for display.</p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-command-line bg-command-bg/55 px-4 py-3 text-left lg:text-right">
          <p className="text-sm text-command-muted">Lead score</p>
          <p className="text-3xl font-semibold text-command-text">{lead.leadScore}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-gold">Next Action</p>
          <p className="mt-2 text-lg font-semibold text-command-text">{next.action}</p>
          <p className="mt-1 text-base leading-7 text-command-muted">{next.reason}</p>
        </div>
        <div className="rounded-2xl border border-command-line bg-command-bg/55 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-cyan">{isWhatsapp ? "Last WhatsApp message" : "Last Message"}</p>
          <p className="mt-2 text-base leading-7 text-command-text">{snippet(lead.lastClientMessage)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-command-muted">Risk</p>
          <div className="mt-2 flex flex-wrap gap-2">{chips(lead.riskFlags, "No major risk flagged")}</div>
        </div>
        <div>
          <p className="text-sm font-semibold text-command-muted">Missing</p>
          <div className="mt-2 flex flex-wrap gap-2">{chips(lead.missingInfo, "No key missing info")}</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={`/leads/${lead.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black transition hover:bg-command-goldHover">
          Open
        </Link>
        <Link href={`/leads/${lead.id}#bot-controls`} className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-bg/55 px-4 py-2 text-base font-semibold text-command-text transition hover:border-command-gold/60">
          Take Over
        </Link>
        <Link href={`/leads/${lead.id}#bot-controls`} className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-bg/55 px-4 py-2 text-base font-semibold text-command-text transition hover:border-command-gold/60">
          Pause Bot
        </Link>
      </div>
    </article>
  );
}
