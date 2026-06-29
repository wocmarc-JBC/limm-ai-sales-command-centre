import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { PageHeader } from "@/components/PageHeader";
import {
  createQuotationPackageAction,
  markQuotationSentAction,
  markQuoteAcceptedAction,
  markQuoteRejectedAction,
  recordQuotationBossAction,
  qaArchiveQaLeadAction,
  qaCreateTestCollectionScheduleAction,
  qaCreateTestDeliveryGateAction,
  qaMarkAcceptedSimulationAction,
  qaMarkSentSimulationAction,
  submitQuotationForBossReviewAction,
  voidQuotationPackageAction
} from "@/lib/actions";
import { can } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/data/audit-repository";
import { getLeadById } from "@/lib/data/leads-repository";
import {
  buildQuotationSendGate,
  getQuotationPackageById,
  getSignedQuotationUrl,
  listQuotationPackagesForLead
} from "@/lib/data/quotation-repository";
import { humanizeList } from "@/lib/labels";
import { getQaWorkflowTestEligibility } from "@/lib/qa-workflow-test-mode";
import { money } from "@/lib/sales-collection";

const bossActions = [
  { key: "approve_quote", label: "Approve Quote", tone: "primary" as const },
  { key: "request_revision", label: "Request Revision", tone: "muted" as const },
  { key: "need_site_visit_first", label: "Need Site Visit First", tone: "muted" as const },
  { key: "ask_for_more_info", label: "Ask For More Info", tone: "muted" as const },
  { key: "reject_hold", label: "Reject / Hold", tone: "danger" as const },
  { key: "pause_bot", label: "Pause Bot", tone: "muted" as const },
  { key: "human_takeover", label: "Human Takeover", tone: "muted" as const }
];

const inputClass = "rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text";

export default async function QuotationDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { created?: string; qaStatus?: string; message?: string };
}) {
  const auth = await getCurrentProfile();
  const canApprove = Boolean(auth.profile && can(auth.profile.role, "approve_requests"));
  const canEdit = Boolean(auth.profile && can(auth.profile.role, "update_leads"));
  const quotation = await getQuotationPackageById(params.id);
  if (!quotation) {
    return (
      <>
        <PageHeader title="Quotation Not Found" eyebrow="Package workflow" />
        <section className="mission-panel rounded-2xl p-6 text-command-muted">
          This quotation package was not found or the quotation package table has not been applied yet.
        </section>
      </>
    );
  }

  const [lead, versionHistory, signedUrl, auditLogs] = await Promise.all([
    getLeadById(quotation.leadId),
    listQuotationPackagesForLead(quotation.leadId, { includeTestDemo: true }),
    getSignedQuotationUrl(quotation.id),
    listAuditLogs({ entityType: "quotation_package", entityId: quotation.id })
  ]);
  const sendGate = buildQuotationSendGate(quotation, lead);
  const canViewCost = canApprove;
  const revisionDefaultNumber = `${quotation.quotationNumber || "LIMM-Q"}-R${quotation.versionNumber + 1}`;
  const qaEligibility = getQaWorkflowTestEligibility({ role: auth.profile?.role, lead, quotation });

  return (
    <>
      <PageHeader title={quotation.quotationNumber || "Quotation Package"} eyebrow={`Version ${quotation.versionNumber} / ${quotation.status}`}>
        <Link href="/quotations" className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-text">
          All Quotations
        </Link>
        <Link href={`/leads/${quotation.leadId}`} className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-text">
          Lead Detail
        </Link>
      </PageHeader>

      {searchParams?.created ? (
        <p className="mb-6 rounded-xl border border-command-green/40 bg-command-green/10 p-3 text-sm font-semibold text-command-green">
          Quotation package created. Upload file and submit for boss review before marking sent.
        </p>
      ) : null}

      {searchParams?.qaStatus ? (
        <p
          className={`mb-6 rounded-xl border p-3 text-sm font-semibold ${
            ["sentSimulated", "acceptedSimulated", "collectionCreated", "deliveryCreated", "leadArchived"].includes(searchParams.qaStatus)
              ? "border-command-green/40 bg-command-green/10 text-command-green"
              : "border-command-amber/50 bg-command-amber/10 text-command-amber"
          }`}
          data-testid="qa-workflow-feedback"
        >
          {searchParams.message || "QA workflow action finished."}
        </p>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <article className="mission-panel rounded-2xl p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Quotation package</p>
              <h2 className="mt-2 text-3xl font-semibold text-command-text">{quotation.clientName}</h2>
              <p className="mt-2 text-sm leading-6 text-command-muted">{quotation.scopeSummary}</p>
            </div>
            <div className="rounded-xl border border-command-line bg-command-bg/55 px-4 py-3 text-sm text-command-muted lg:text-right">
              <p>Amount</p>
              <p className="text-2xl font-semibold text-command-text">{money(quotation.quotationAmount)}</p>
              {canViewCost ? (
                <>
                  <p className="mt-2">Internal cost: {quotation.internalCostEstimate ? money(quotation.internalCostEstimate) : "Not set"}</p>
                  <p>Margin: {quotation.marginEstimate ? money(quotation.marginEstimate) : "Not set"}</p>
                </>
              ) : null}
            </div>
          </div>

          <dl className="mt-5 grid gap-3 text-sm md:grid-cols-3">
            <div className="rounded-xl border border-command-line bg-command-bg/55 p-3">
              <dt className="text-command-muted">Prepared by</dt>
              <dd className="mt-1 font-semibold text-command-text">{quotation.preparedBy || "Not set"}</dd>
            </div>
            <div className="rounded-xl border border-command-line bg-command-bg/55 p-3">
              <dt className="text-command-muted">Expiry</dt>
              <dd className="mt-1 font-semibold text-command-text">{quotation.expiryDate || "Not set"}</dd>
            </div>
            <div className="rounded-xl border border-command-line bg-command-bg/55 p-3">
              <dt className="text-command-muted">File</dt>
              <dd className="mt-1 font-semibold text-command-text">{quotation.originalFileName || "No file uploaded"}</dd>
            </div>
          </dl>

          <section className="mt-5 rounded-xl border border-command-line bg-command-bg/55 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-semibold text-command-text">Quotation file</p>
                <p className="mt-1 text-sm text-command-muted">
                  Private storage path is not exposed. Use the signed preview/download link when available.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={signedUrl || "#"}
                  className="inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black"
                  data-testid="view-quotation-file"
                >
                  View Quotation
                </a>
                <a
                  href={signedUrl || "#"}
                  className="inline-flex min-h-11 items-center rounded-xl border border-command-line bg-command-card px-4 py-2 text-base font-semibold text-command-text"
                  data-testid="download-quotation-file"
                >
                  Download Quotation
                </a>
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-command-line bg-command-bg/55 p-4">
              <p className="font-semibold text-command-text">Boss notes</p>
              <p className="mt-2 text-sm leading-6 text-command-muted">{quotation.bossNotes || "No boss notes yet."}</p>
            </div>
            <div className="rounded-xl border border-command-line bg-command-bg/55 p-4">
              <p className="font-semibold text-command-text">Revision / client notes</p>
              <p className="mt-2 text-sm leading-6 text-command-muted">{quotation.revisionNotes || quotation.clientNotes || "No revision/client notes yet."}</p>
            </div>
          </section>
        </article>

        <aside className="mission-panel rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Send gate</p>
          <h2 className="mt-2 text-2xl font-semibold text-command-text">{sendGate.canMarkSent ? "Ready to mark sent" : "Cannot mark sent"}</h2>
          <p className="mt-2 text-sm leading-6 text-command-muted">
            {sendGate.canMarkSent ? "Boss approval and uploaded quotation file are present." : sendGate.missing.join(" | ")}
          </p>
          <form action={markQuotationSentAction} className="mt-4">
            <input type="hidden" name="lead_id" value={quotation.leadId} />
            <input type="hidden" name="quotation_id" value={quotation.id} />
            <ActionButton type="submit" disabled={!canEdit || !sendGate.canMarkSent} data-testid="mark-quotation-sent">
              Mark Sent to Client
            </ActionButton>
          </form>
        </aside>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        <article className="mission-panel rounded-2xl p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Submit / boss review</p>
              <h2 className="mt-1 text-2xl font-semibold text-command-text">One clear boss action area</h2>
              <p className="mt-2 text-sm text-command-muted">
                Decisions attach to quotation v{quotation.versionNumber}, create audit logs, and do not send WhatsApp, create prices, or book Calendar events.
              </p>
            </div>
            <form action={submitQuotationForBossReviewAction}>
              <input type="hidden" name="quotation_id" value={quotation.id} />
              <input type="hidden" name="note" value="Submitted from quotation detail page." />
              <ActionButton type="submit" tone="muted" disabled={!canEdit || quotation.status === "Submitted for Boss Review"} data-testid="submit-quotation-review">
                Submit For Boss Review
              </ActionButton>
            </form>
          </div>

          {!canApprove ? <p className="mt-4 text-sm text-command-amber">Boss approval actions require boss/admin role.</p> : null}
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {bossActions.map((action) => (
              <form key={action.key} action={recordQuotationBossAction} className="rounded-xl border border-command-line bg-command-bg/55 p-3">
                <input type="hidden" name="quotation_id" value={quotation.id} />
                <input type="hidden" name="action_key" value={action.key} />
                <label className="grid gap-1 text-sm text-command-muted">
                  <span>Boss note</span>
                  <input name="note" placeholder="Optional note" className={inputClass} />
                </label>
                <div className="mt-3">
                  <ActionButton type="submit" tone={action.tone} disabled={!canApprove} data-testid={`quotation-action-${action.key}`}>
                    {action.label}
                  </ActionButton>
                </div>
              </form>
            ))}
          </div>
        </article>

        <article className="mission-panel rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Client decision</p>
          <h2 className="mt-1 text-2xl font-semibold text-command-text">Manual acceptance/rejection only</h2>
          <p className="mt-2 text-sm text-command-muted">
            Mark accepted only after the client has confirmed. Accepted quotations create project/payment records and activate collection/start gates.
          </p>
          <div className="mt-5 grid gap-3">
            <form action={markQuoteAcceptedAction} className="rounded-xl border border-command-line bg-command-bg/55 p-3">
              <input type="hidden" name="quotation_id" value={quotation.id} />
              <label className="grid gap-1 text-sm text-command-muted">
                <span>Client acceptance note</span>
                <input name="client_notes" placeholder="Client accepted by WhatsApp/call/email..." className={inputClass} />
              </label>
              <div className="mt-3">
                <ActionButton type="submit" disabled={!canEdit || !["Sent to Client", "Client Reviewing", "Boss Approved"].includes(quotation.status)} data-testid="mark-quote-accepted">
                  Mark Quote Accepted
                </ActionButton>
              </div>
            </form>
            <form action={markQuoteRejectedAction} className="rounded-xl border border-command-line bg-command-bg/55 p-3">
              <input type="hidden" name="quotation_id" value={quotation.id} />
              <label className="grid gap-1 text-sm text-command-muted">
                <span>Rejection note</span>
                <input name="client_notes" placeholder="Reason or follow-up note" className={inputClass} />
              </label>
              <div className="mt-3">
                <ActionButton type="submit" tone="danger" disabled={!canEdit} data-testid="mark-quote-rejected">
                  Mark Quote Rejected
                </ActionButton>
              </div>
            </form>
            <form action={voidQuotationPackageAction} className="rounded-xl border border-command-red/50 bg-command-bg/55 p-3">
              <input type="hidden" name="quotation_id" value={quotation.id} />
              <label className="grid gap-1 text-sm text-command-muted">
                <span>Void reason</span>
                <input name="void_reason" placeholder="Wrong upload, duplicate, or obsolete version" className={inputClass} />
              </label>
              <div className="mt-3">
                <ActionButton type="submit" tone="danger" disabled={!canApprove} data-testid="void-quotation">
                  Void Quotation
                </ActionButton>
              </div>
            </form>
          </div>
        </article>
      </section>

      {canApprove ? (
        <section className="mt-6 mission-panel rounded-2xl border-command-cyan/40 p-5" data-testid="qa-workflow-test-controls">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">QA Workflow Test Controls</p>
              <h2 className="mt-1 text-2xl font-semibold text-command-text">Downstream simulation only</h2>
              <p className="mt-2 text-sm leading-6 text-command-muted">
                Boss/admin QA mode only. These controls do not send WhatsApp, email, create Calendar bookings, or generate prices. Real Send Gate rules remain unchanged.
              </p>
            </div>
            <span className="inline-flex rounded-full border border-command-cyan/60 bg-command-cyan/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-command-cyan">
              QA TEST RECORD — NOT REAL CLIENT
            </span>
          </div>

          {!qaEligibility.eligible ? (
            <p className="mt-4 rounded-xl border border-command-amber/45 bg-command-amber/10 p-3 text-sm font-semibold text-command-amber" data-testid="qa-workflow-disabled-reason">
              QA controls disabled: {qaEligibility.reasons.join(" ")}
            </p>
          ) : null}

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <form action={qaMarkSentSimulationAction} className="rounded-xl border border-command-line bg-command-bg/55 p-3">
              <input type="hidden" name="quotation_id" value={quotation.id} />
              <ActionButton type="submit" tone="muted" disabled={!qaEligibility.eligible} data-testid="qa-mark-sent-simulation">
                QA Mark Sent Simulation
              </ActionButton>
            </form>
            <form action={qaMarkAcceptedSimulationAction} className="rounded-xl border border-command-line bg-command-bg/55 p-3">
              <input type="hidden" name="quotation_id" value={quotation.id} />
              <ActionButton type="submit" tone="muted" disabled={!qaEligibility.eligible} data-testid="qa-mark-accepted-simulation">
                QA Mark Accepted Simulation
              </ActionButton>
            </form>
            <form action={qaCreateTestCollectionScheduleAction} className="rounded-xl border border-command-line bg-command-bg/55 p-3">
              <input type="hidden" name="quotation_id" value={quotation.id} />
              <ActionButton type="submit" tone="muted" disabled={!qaEligibility.eligible} data-testid="qa-create-test-collection-schedule">
                QA Create Test Collection Schedule
              </ActionButton>
            </form>
            <form action={qaCreateTestDeliveryGateAction} className="rounded-xl border border-command-line bg-command-bg/55 p-3">
              <input type="hidden" name="quotation_id" value={quotation.id} />
              <ActionButton type="submit" tone="muted" disabled={!qaEligibility.eligible} data-testid="qa-create-test-delivery-gate">
                QA Create Test Delivery Gate
              </ActionButton>
            </form>
            <form action={qaArchiveQaLeadAction} className="rounded-xl border border-command-line bg-command-bg/55 p-3">
              <input type="hidden" name="quotation_id" value={quotation.id} />
              <ActionButton type="submit" tone="danger" disabled={!qaEligibility.eligible} data-testid="qa-archive-qa-lead">
                QA Archive QA Lead
              </ActionButton>
            </form>
          </div>
        </section>
      ) : null}

      <section className="mt-6 mission-panel rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Upload revised quotation</p>
        <form action={createQuotationPackageAction} className="mt-4 grid gap-4 md:grid-cols-2" data-testid="upload-revised-quotation-form">
          <input type="hidden" name="lead_id" value={quotation.leadId} />
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Quotation number</span>
            <input name="quotation_number" defaultValue={revisionDefaultNumber} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Quotation amount</span>
            <input name="quotation_amount" type="number" min="0" step="1" defaultValue={quotation.quotationAmount} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted md:col-span-2">
            <span>Scope summary</span>
            <textarea name="scope_summary" defaultValue={quotation.scopeSummary} rows={3} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Prepared by</span>
            <input name="prepared_by" defaultValue={auth.profile?.fullName ?? "Marcus"} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Expiry date</span>
            <input name="expiry_date" type="date" defaultValue={quotation.expiryDate ?? ""} className={inputClass} />
          </label>
          {canViewCost ? (
            <>
              <label className="grid gap-1 text-sm text-command-muted">
                <span>Internal cost estimate</span>
                <input name="internal_cost_estimate" type="number" min="0" step="1" defaultValue={quotation.internalCostEstimate ?? 0} className={inputClass} />
              </label>
              <label className="grid gap-1 text-sm text-command-muted">
                <span>Margin estimate</span>
                <input name="margin_estimate" type="number" min="0" step="1" defaultValue={quotation.marginEstimate ?? 0} className={inputClass} />
              </label>
            </>
          ) : null}
          <label className="grid gap-1 text-sm text-command-muted md:col-span-2">
            <span>Notes to boss</span>
            <textarea name="boss_notes" defaultValue={quotation.revisionNotes || quotation.bossNotes} rows={3} className={inputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted md:col-span-2">
            <span>Upload revised quotation file</span>
            <input name="file" type="file" accept=".pdf,.xls,.xlsx,.doc,.docx,image/jpeg,image/png,image/webp" className={inputClass} />
          </label>
          <div className="md:col-span-2">
            <ActionButton type="submit" disabled={!canEdit} data-testid="upload-draft-quotation">
              Upload Draft Quotation
            </ActionButton>
          </div>
        </form>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        <article className="mission-panel rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Version history</p>
          <div className="mt-4 space-y-3">
            {versionHistory.map((version) => (
              <Link key={version.id} href={`/quotations/${version.id}`} className="block rounded-xl border border-command-line bg-command-bg/55 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-command-text">{version.quotationNumber} / v{version.versionNumber}</p>
                    <p className="mt-1 text-sm text-command-muted">{version.status}</p>
                  </div>
                  <p className="text-sm font-semibold text-command-text">{money(version.quotationAmount)}</p>
                </div>
              </Link>
            ))}
          </div>
        </article>

        <article className="mission-panel rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Audit timeline</p>
          <div className="mt-4 space-y-3">
            {auditLogs.length ? auditLogs.slice(0, 12).map((log) => (
              <div key={log.id} className="rounded-xl border border-command-line bg-command-bg/55 p-4">
                <p className="text-sm font-semibold text-command-text">{log.action}</p>
                <p className="mt-1 text-sm text-command-muted">{log.summary}</p>
                <p className="mt-1 text-xs text-command-subtle">{log.createdAt} / {log.actorName}</p>
              </div>
            )) : (
              <p className="rounded-xl border border-command-line bg-command-bg/55 p-4 text-command-muted">
                No quotation audit events yet.
              </p>
            )}
          </div>
        </article>
      </section>

      {lead ? (
        <section className="mt-6 mission-panel rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Lead context</p>
          <p className="mt-2 text-sm text-command-muted">Risk flags: {humanizeList(lead.riskFlags)}</p>
          <p className="mt-1 text-sm text-command-muted">Missing info: {humanizeList(lead.missingInfo)}</p>
        </section>
      ) : null}
    </>
  );
}
