import { ActionButton } from "@/components/ActionButton";
import { PageHeader } from "@/components/PageHeader";
import { can } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";
import { recordBossReviewAction } from "@/lib/actions";
import { bossReviewActions, type BossReviewActionKey } from "@/lib/boss-ops";
import { getShowTestDemoRecordsPreference } from "@/lib/data-visibility-preference";
import { listApprovalRequests } from "@/lib/data/approvals-repository";
import { listLeads } from "@/lib/data/leads-repository";
import { approvalGateMatrix } from "@/lib/approval-gates";
import { humanizeList } from "@/lib/labels";

const bossActionOrder: BossReviewActionKey[] = [
  "approve_quote",
  "need_site_visit_first",
  "ask_for_more_info",
  "reject_quote",
  "pause_bot",
  "human_takeover",
  "escalate_to_manager"
];

const bossActionLabels: Record<BossReviewActionKey, string> = {
  approve_quote: "Approve Quote",
  need_site_visit_first: "Need Site Visit First",
  ask_for_more_info: "Ask For More Info",
  reject_quote: "Reject / Revise Quote",
  pause_bot: "Pause Bot",
  human_takeover: "Human Takeover",
  escalate_to_manager: "Escalate To Manager"
};

const orderedBossReviewActions = bossActionOrder
  .map((key) => bossReviewActions.find((action) => action.key === key))
  .filter(Boolean) as typeof bossReviewActions;

export default async function BossApprovalQueuePage() {
  const auth = await getCurrentProfile();
  const canApprove = Boolean(auth.profile && can(auth.profile.role, "approve_requests"));
  const showTestDemoRecords = await getShowTestDemoRecordsPreference();
  const leads = await listLeads({ includeTest: showTestDemoRecords });
  const visibleLeadIds = new Set(leads.map((lead) => lead.id));
  const approvalRequests = await listApprovalRequests({ includeTestDemo: showTestDemoRecords, visibleLeadIds });
  return (
    <>
      <PageHeader title="Boss Review Gate" eyebrow="Risk control" />
      <section className="mb-6 rounded border border-command-line bg-command-panel p-5 shadow-command">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-gold">Quote gate rule</p>
        <p className="mt-2 text-sm leading-6 text-command-muted">
          High-risk or high-value leads cannot move to Quotation Sent / Quoted until a boss approval audit record exists. Actions below log timestamp, user, action, and note.
        </p>
      </section>
      <div className="space-y-4">
        {approvalRequests.map((request) => (
          <article key={request.id} data-testid={`approval-${request.id}`} className="rounded border border-command-line bg-command-panel p-5 shadow-command">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold">{request.title}</h3>
                <p className="mt-1 text-sm text-command-muted">{request.reason}</p>
              </div>
              <p className="text-sm text-command-muted">{request.createdAt}</p>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded border border-command-line bg-command-panel2 p-3 text-sm">
                <p className="text-command-muted">Approval reason</p>
                <p className="mt-1">{request.reason}</p>
              </div>
              <div className="rounded border border-command-line bg-command-panel2 p-3 text-sm">
                <p className="text-command-muted">Risk</p>
                <p className="mt-1">{humanizeList(request.riskFlags)}</p>
              </div>
              <div className="rounded border border-command-line bg-command-panel2 p-3 text-sm">
                <p className="text-command-muted">System recommendation</p>
                <p className="mt-1">{request.aiRecommendation}</p>
              </div>
            </div>
            <p className="mt-4 rounded border border-command-line bg-command-panel2 p-3 text-sm">{request.proposedReply || request.aiRecommendation}</p>
            <p className="mt-3 text-sm text-command-muted">Status: {request.status}</p>
            {!canApprove ? <p className="mt-3 text-sm text-command-amber">Approval actions require boss/admin role.</p> : null}
            <div className="mt-4 rounded-xl border border-command-gold/40 bg-command-panel2 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-command-text">Boss action area</p>
                  <p className="mt-1 text-sm text-command-muted">
                    Choose one decision. It records an audit log and does not send WhatsApp, generate prices, or book Calendar events.
                  </p>
                </div>
                <span className="rounded-full border border-command-gold/60 bg-command-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-command-gold">
                  Primary: Approve Quote
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {orderedBossReviewActions.map((bossAction) => (
                  <form
                    key={bossAction.key}
                    action={recordBossReviewAction}
                    className={`grid gap-2 rounded-lg border p-3 ${
                      bossAction.key === "approve_quote"
                        ? "border-command-gold/70 bg-command-gold/10"
                        : "border-command-line bg-command-bg/55"
                    }`}
                  >
                    <input type="hidden" name="lead_id" value={request.leadId} />
                    <input type="hidden" name="action_key" value={bossAction.key} />
                    <label className="text-xs font-semibold uppercase tracking-[0.14em] text-command-subtle" htmlFor={`${request.id}-${bossAction.key}-note`}>
                      Boss note
                    </label>
                    <input id={`${request.id}-${bossAction.key}-note`} name="note" placeholder="Optional note" className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
                    <ActionButton
                      type="submit"
                      tone={bossAction.key === "approve_quote" ? "primary" : bossAction.key === "reject_quote" ? "danger" : "muted"}
                      disabled={!canApprove}
                    >
                      {bossActionLabels[bossAction.key]}
                    </ActionButton>
                  </form>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
      <section className="mt-6 rounded border border-command-line bg-command-panel p-5 shadow-command">
        <h3 className="text-lg font-semibold">Approval Gate Matrix</h3>
        <p className="mt-1 text-sm text-command-muted">Safe collection actions can proceed; risky client-facing decisions require Marcus approval.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {approvalGateMatrix.map((gate) => (
            <div key={gate.key} className="rounded border border-command-line bg-command-panel2 p-3 text-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <p className="font-semibold">{gate.label}</p>
                <span className={gate.requiresMarcusApproval ? "text-command-amber" : "text-command-green"}>
                  {gate.requiresMarcusApproval ? "Marcus approval required" : "Auto-safe draft"}
                </span>
              </div>
              <p className="mt-2 text-command-muted">{gate.reason}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
