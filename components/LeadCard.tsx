import Link from "next/link";
import { evaluateBookingReadiness } from "@/lib/calendar-booking";
import type { Lead } from "@/lib/types";
import { humanizeLabel, humanizeList } from "@/lib/labels";
import { cleanLeadDisplayName } from "@/lib/lead-display";
import { getNextBestAction } from "@/lib/next-best-action";
import { buildConversationSummary, buildFollowUpReminder, calculateLeadLevel, missionForLead, readinessStatus } from "@/lib/sales-control";
import { matchQuestionBankIntent } from "@/lib/whatsapp-question-bank";
import { StatusBadge } from "./StatusBadge";

export function LeadCard({ lead }: { lead: Lead }) {
  const next = getNextBestAction(lead);
  const booking = evaluateBookingReadiness({ lead, latestText: lead.lastClientMessage });
  const isWhatsapp = /whatsapp/i.test(lead.source);
  const needsFiles = lead.missingInfo.includes("floor_plan") || lead.missingInfo.includes("site_photos");
  const questionMatch = isWhatsapp ? matchQuestionBankIntent(lead.lastClientMessage) : null;
  const showQuestionBadge = Boolean(questionMatch && questionMatch.score > 0 && questionMatch.entry.intent_key !== "unsupported");
  const leadLevel = lead.leadLevel ?? calculateLeadLevel(lead);
  const mission = lead.missionCategory || missionForLead(lead);
  const infoCollected = Math.max(0, Math.min(100, 100 - lead.missingInfo.length * 18));
  const displayName = cleanLeadDisplayName(lead);
  return (
    <article className="rounded-lg border border-command-line bg-command-card p-5 shadow-premium">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/leads/${lead.id}`} className="text-xl font-semibold leading-7 text-command-text hover:text-command-gold">
              {displayName}
            </Link>
            <StatusBadge label={lead.leadCategory} />
            <StatusBadge label={leadLevel} />
            <StatusBadge label={mission} />
            <StatusBadge label={lead.status} />
            {isWhatsapp ? <StatusBadge label="WhatsApp" /> : null}
            {lead.botPaused ? <StatusBadge label="Bot Paused" /> : null}
            {lead.needsMarcus ? <StatusBadge label="Needs Marcus" /> : null}
            {lead.deletedAt ? <StatusBadge label="Soft Deleted" /> : null}
            {lead.archivedAt ? <StatusBadge label="Archived" /> : null}
            {lead.isTest ? <StatusBadge label="Test Lead" /> : null}
            {lead.isSpam ? <StatusBadge label="Spam" /> : null}
            {showQuestionBadge ? <StatusBadge label={questionMatch!.entry.category} /> : null}
            {booking.appointmentIntent ? <StatusBadge label="Appointment Requested" /> : null}
            {questionMatch?.entry.escalation_rule !== "auto_safe" && showQuestionBadge ? <StatusBadge label="Boss Review Required" /> : null}
            {needsFiles ? <StatusBadge label="Needs Floor Plan / Photos" /> : null}
          </div>
          <p className="mt-2 text-base text-command-muted">
            {lead.phone} | {lead.source} | {lead.division}
          </p>
          {displayName !== lead.clientName ? (
            <p className="mt-1 text-sm text-command-subtle">Generated CRM title cleaned for display.</p>
          ) : null}
        </div>
        <div className="rounded-lg border border-command-line bg-command-elevated px-4 py-3 text-right">
          <p className="text-[13px] text-command-muted">Lead Heat Score</p>
          <p className="text-2xl font-semibold text-command-text">{lead.leadScore}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_15rem]">
        <div className="rounded-lg border border-command-line bg-command-elevated p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-command-gold">Mission Brief</p>
          <p className="mt-2 text-base leading-7 text-command-text">{buildConversationSummary(lead)}</p>
          <p className="mt-2 text-sm text-command-muted">{buildFollowUpReminder(lead)}</p>
        </div>
        <div className="rounded-lg border border-command-line bg-command-elevated p-4">
          <p className="text-sm text-command-muted">Info Collected</p>
          <div className="mt-2 h-2 rounded-full bg-command-bg">
            <div className="h-2 rounded-full bg-command-gold" style={{ width: `${infoCollected}%` }} />
          </div>
          <p className="mt-2 text-sm font-semibold text-command-text">{infoCollected}% | {readinessStatus(lead)}</p>
        </div>
      </div>
      <dl className="mt-5 grid gap-4 text-base lg:grid-cols-3">
        <div>
          <dt className="text-command-muted">Property type</dt>
          <dd className="text-command-text">{lead.propertyType}</dd>
        </div>
        <div>
          <dt className="text-command-muted">Scope</dt>
          <dd className="text-command-text">{lead.scopeSummary}</dd>
        </div>
        <div>
          <dt className="text-command-muted">Missing Info</dt>
          <dd className="text-command-text">{humanizeList(lead.missingInfo)}</dd>
        </div>
        <div>
          <dt className="text-command-muted">Risk flags</dt>
          <dd className="text-command-text">{humanizeList(lead.riskFlags)}</dd>
        </div>
        <div>
          <dt className="text-command-muted">Appointment readiness</dt>
          <dd className="text-command-text">{lead.appointmentReadiness}% | {humanizeLabel(booking.status)}</dd>
        </div>
        <div>
          <dt className="text-command-muted">Quotation readiness</dt>
          <dd className="text-command-text">{lead.quotationReadiness}%</dd>
        </div>
      </dl>
      {isWhatsapp ? (
        <div className="mt-5 rounded-lg border border-command-line bg-command-elevated p-4 text-base">
          <p className="text-command-muted">Last WhatsApp message</p>
          <p className="mt-2 text-command-text">{lead.lastClientMessage || "No WhatsApp message preview yet."}</p>
          <p className="mt-3 text-sm text-command-muted">
            Booking readiness: {humanizeLabel(booking.status)} | Missing booking info: {humanizeList(booking.missingInfo)}
          </p>
          {showQuestionBadge ? (
            <p className="mt-2 text-sm text-command-muted">
              Question category: {questionMatch!.entry.category} | Reply strategy: {questionMatch!.entry.safe_answer_strategy}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-5 rounded-lg border border-command-line bg-command-elevated p-4 text-base">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-command-text">{next.action}</p>
            <p className="mt-1 text-command-muted">{next.reason}</p>
          </div>
          <span className="rounded-md border border-command-line px-3 py-1 text-sm text-command-muted">Urgency: {next.urgency}</span>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={`/leads/${lead.id}`} className="inline-flex min-h-11 items-center rounded-md border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black transition hover:bg-command-goldHover">
          Open Lead
        </Link>
        <Link href={`/leads/${lead.id}#bot-controls`} className="inline-flex min-h-11 items-center rounded-md border border-command-line bg-command-elevated px-4 py-2 text-base font-semibold text-command-text transition hover:border-command-gold/60">
          Pause Bot
        </Link>
        <Link href={`/leads/${lead.id}#bot-controls`} className="inline-flex min-h-11 items-center rounded-md border border-command-line bg-command-elevated px-4 py-2 text-base font-semibold text-command-text transition hover:border-command-gold/60">
          Take Over
        </Link>
      </div>
    </article>
  );
}
