import type { ConversationBrief, OperatorSlaState } from "@/lib/operator-advantage";

const slaTone = {
  inactive: "border-command-line bg-command-bg/70 text-command-muted before:bg-command-subtle",
  "on-track": "border-command-green/35 bg-command-green/10 text-command-green before:bg-command-green",
  due: "border-command-amber/45 bg-command-amber/10 text-command-amber before:bg-command-amber",
  breached: "border-command-red/45 bg-command-red/10 text-command-red before:bg-command-red"
} satisfies Record<OperatorSlaState["status"], string>;

const factCards = [
  ["Client need", "clientNeed"],
  ["Open question", "openQuestion"],
  ["Last commitment", "lastCommitment"],
  ["Risk / conflict", "riskSummary"]
] as const;

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
    <section className="relative shrink-0 overflow-hidden border-b border-command-gold/15 bg-[linear-gradient(105deg,rgba(221,179,93,0.10),rgba(18,23,30,0.88)_36%,rgba(18,23,30,0.72))] px-3 py-1.5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-command-gold/70 sm:px-4 sm:py-2.5" data-testid="inbox-operator-brief" aria-label="Operator conversation brief">
      <div className="flex items-center justify-between gap-2 sm:items-start sm:gap-3">
        <div className="min-w-0">
          <p className="hidden text-[10px] font-bold uppercase tracking-[0.18em] text-command-gold sm:block">Next best action</p>
          <p className="truncate text-xs font-semibold text-command-text sm:mt-1 sm:text-sm">{brief.nextAction}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`relative rounded-full border py-0.5 pl-4 pr-2 text-[9px] font-semibold before:absolute before:left-2 before:top-1/2 before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:rounded-full sm:py-1 sm:pl-[1.125rem] sm:pr-2.5 sm:text-[10px] ${slaTone[sla.status]}`} title={sla.detail}>
            {sla.label}
          </span>
          <button type="button" onClick={onOpenDetails} className="hidden min-h-8 items-center rounded-lg border border-command-line/80 bg-command-bg/35 px-2.5 py-1 text-[11px] font-semibold text-command-muted transition hover:border-command-gold/40 hover:bg-command-bg hover:text-command-text sm:inline-flex">
            Full context
          </button>
        </div>
      </div>
      <dl className="mt-2 hidden grid-cols-4 gap-2 sm:grid">
        {factCards.map(([label, key]) => (
          <div key={key} className="min-w-0 rounded-lg border border-command-line/55 bg-command-bg/30 px-2.5 py-1.5">
            <dt className="text-[9px] font-semibold uppercase tracking-[0.13em] text-command-subtle">{label}</dt>
            <dd className="mt-0.5 truncate text-[11px] text-command-muted" title={brief[key]}>{brief[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
