import { ActionButton } from "@/components/ActionButton";
import { PageHeader } from "@/components/PageHeader";
import { can } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";
import { decideApprovalAction } from "@/lib/actions";
import { listApprovalRequests } from "@/lib/data/approvals-repository";
import { approvalGateMatrix } from "@/lib/approval-gates";
import { humanizeList } from "@/lib/labels";

export default async function BossApprovalQueuePage() {
  const auth = await getCurrentProfile();
  const canApprove = Boolean(auth.profile && can(auth.profile.role, "approve_requests"));
  const approvalRequests = await listApprovalRequests();
  return (
    <>
      <PageHeader title="Boss Approval Queue" eyebrow="Risk control" />
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
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={decideApprovalAction}>
                <input type="hidden" name="approval_id" value={request.id} />
                <input type="hidden" name="decision" value="approved" />
                <ActionButton type="submit" disabled={!canApprove}>Approve Reply</ActionButton>
              </form>
              <form action={decideApprovalAction}>
                <input type="hidden" name="approval_id" value={request.id} />
                <input type="hidden" name="decision" value="more_info" />
                <ActionButton type="submit" tone="muted" disabled={!canApprove}>Request More Info</ActionButton>
              </form>
              <form action={decideApprovalAction}>
                <input type="hidden" name="approval_id" value={request.id} />
                <input type="hidden" name="decision" value="rejected" />
                <ActionButton type="submit" tone="danger" disabled={!canApprove}>Hold</ActionButton>
              </form>
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
