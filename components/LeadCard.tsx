import Link from "next/link";
import type { Lead } from "@/lib/types";
import { humanizeList } from "@/lib/labels";
import { getNextBestAction } from "@/lib/next-best-action";
import { StatusBadge } from "./StatusBadge";

export function LeadCard({ lead }: { lead: Lead }) {
  const next = getNextBestAction(lead);
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
          <dd className="text-command-text">{lead.appointmentReadiness}%</dd>
        </div>
        <div>
          <dt className="text-command-muted">Quotation readiness</dt>
          <dd className="text-command-text">{lead.quotationReadiness}%</dd>
        </div>
      </dl>
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
