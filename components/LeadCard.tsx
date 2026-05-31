import Link from "next/link";
import { evaluateBookingReadiness } from "@/lib/calendar-booking";
import type { Lead } from "@/lib/types";
import { humanizeLabel, humanizeList } from "@/lib/labels";
import { getNextBestAction } from "@/lib/next-best-action";
import { matchQuestionBankIntent } from "@/lib/whatsapp-question-bank";
import { StatusBadge } from "./StatusBadge";

export function LeadCard({ lead }: { lead: Lead }) {
  const next = getNextBestAction(lead);
  const booking = evaluateBookingReadiness({ lead, latestText: lead.lastClientMessage });
  const isWhatsapp = /whatsapp/i.test(lead.source);
  const needsFiles = lead.missingInfo.includes("floor_plan") || lead.missingInfo.includes("site_photos");
  const questionMatch = isWhatsapp ? matchQuestionBankIntent(lead.lastClientMessage) : null;
  const showQuestionBadge = Boolean(questionMatch && questionMatch.score > 0 && questionMatch.entry.intent_key !== "unsupported");
  return (
    <article className="rounded border border-command-line bg-command-panel p-4 shadow-command">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/leads/${lead.id}`} className="text-lg font-semibold text-command-text hover:text-command-cyan">
              {lead.clientName}
            </Link>
            <StatusBadge label={lead.leadCategory} />
            <StatusBadge label={lead.status} />
            {isWhatsapp ? <StatusBadge label="WhatsApp" /> : null}
            {showQuestionBadge ? <StatusBadge label={questionMatch!.entry.category} /> : null}
            {booking.appointmentIntent ? <StatusBadge label="Appointment Requested" /> : null}
            {questionMatch?.entry.escalation_rule !== "auto_safe" && showQuestionBadge ? <StatusBadge label="Boss Review Required" /> : null}
            {needsFiles ? <StatusBadge label="Needs Floor Plan / Photos" /> : null}
          </div>
          <p className="mt-1 text-sm text-command-muted">
            {lead.phone} | {lead.source} | {lead.division}
          </p>
        </div>
        <div className="rounded border border-command-line bg-command-panel2 px-3 py-2 text-right">
          <p className="text-xs text-command-muted">Lead score</p>
          <p className="text-xl font-semibold text-command-text">{lead.leadScore}</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-sm lg:grid-cols-3">
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
        <div className="mt-4 rounded border border-command-line bg-command-panel2 p-3 text-sm">
          <p className="text-command-muted">Last WhatsApp message</p>
          <p className="mt-1 text-command-text">{lead.lastClientMessage || "No WhatsApp message preview yet."}</p>
          <p className="mt-2 text-xs text-command-muted">
            Booking readiness: {humanizeLabel(booking.status)} | Missing booking info: {humanizeList(booking.missingInfo)}
          </p>
          {showQuestionBadge ? (
            <p className="mt-2 text-xs text-command-muted">
              Question category: {questionMatch!.entry.category} | Reply strategy: {questionMatch!.entry.safe_answer_strategy}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4 rounded border border-command-line bg-command-panel2 p-3 text-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-command-text">{next.action}</p>
            <p className="mt-1 text-command-muted">{next.reason}</p>
          </div>
          <span className="rounded border border-command-line px-2 py-1 text-xs text-command-muted">Urgency: {next.urgency}</span>
        </div>
      </div>
      <div className="mt-4">
        <Link href={`/leads/${lead.id}`} className="inline-flex rounded border border-command-cyan bg-command-cyan px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110">
          Review Lead
        </Link>
      </div>
    </article>
  );
}
