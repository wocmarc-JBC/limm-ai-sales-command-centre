import type { ConversationBrief, OperatorSlaState } from "@/lib/operator-advantage";

const slaTone = {
  inactive: "border-command-line bg-command-bg/70 text-command-muted",
  "on-track": "border-command-green/35 bg-command-green/10 text-command-green",
  due: "border-command-amber/45 bg-command-amber/10 text-command-amber",
  breached: "border-command-red/45 bg-command-red/10 text-command-red"
} satisfies Record<OperatorSlaState["status"], string>;

export function InboxOperatorBrief({
  brief,
  sla,
  onOpenDetails
}: {
  brief: ConversationBrief;
  sla: OperatorSlaState;
  onOpenDetails: () => void;
}) {
  return (
    <section className="shrink-0 border-b border-command-line bg-command-panel2/70 px-3 py-1.5 sm:px-4 sm:py-2.5" data-testid="inbox-operator-brief" aria-label="Operator conversation brief">
      <div className="flex items-center justify-between gap-2 sm:items-start sm:gap-3">
        <div className="min-w-0">
          <p className="hidden text-[10px] font-bold uppercase tracking-[0.16em] text-command-cyan sm:block">Operator brief</p>
          <p className="truncate text-xs font-semibold text-command-text sm:mt-1 sm:text-sm">Next: {brief.nextAction}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold sm:px-2.5 sm:py-1 sm:text-[10px] ${slaTone[sla.status]}`} title={sla.detail}>
            {sla.label}
          </span>
          <button type="button" onClick={onOpenDetails} className="hidden rounded-lg px-2.5 py-1 text-[11px] font-semibold text-command-muted transition hover:bg-command-bg hover:text-command-text sm:inline-flex">
            Full context
          </button>
        </div>
      </div>
      <dl className="mt-2 hidden grid-cols-4 gap-2 border-t border-command-line/60 pt-2 sm:grid">
        <div className="min-w-0">
          <dt className="text-[9px] font-semibold uppercase tracking-[0.13em] text-command-subtle">Client need</dt>
          <dd className="mt-0.5 truncate text-[11px] text-command-muted" title={brief.clientNeed}>{brief.clientNeed}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[9px] font-semibold uppercase tracking-[0.13em] text-command-subtle">Open question</dt>
          <dd className="mt-0.5 truncate text-[11px] text-command-muted" title={brief.openQuestion}>{brief.openQuestion}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[9px] font-semibold uppercase tracking-[0.13em] text-command-subtle">Last commitment</dt>
          <dd className="mt-0.5 truncate text-[11px] text-command-muted" title={brief.lastCommitment}>{brief.lastCommitment}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[9px] font-semibold uppercase tracking-[0.13em] text-command-subtle">Risk / conflict</dt>
          <dd className="mt-0.5 truncate text-[11px] text-command-muted" title={brief.riskSummary}>{brief.riskSummary}</dd>
        </div>
      </dl>
    </section>
  );
}
