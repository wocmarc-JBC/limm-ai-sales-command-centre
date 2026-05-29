import { ActionButton } from "@/components/ActionButton";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
  generateAiDryRunRecommendationAction,
  markBossApprovalNeededAction,
  markLeadNotSuitableAction,
  moveLeadToQuotationReadinessAction,
  reviewAiDraftAction,
  updateLeadStatusAction
} from "@/lib/actions";
import { getCurrentProfile } from "@/lib/auth/session";
import { getLatestAiRecommendationForLead } from "@/lib/data/ai-decisions-repository";
import { listAuditLogs } from "@/lib/data/audit-repository";
import { listLeadMessages } from "@/lib/data/lead-messages-repository";
import { getLeadById } from "@/lib/data/leads-repository";
import { getQuotationReadinessForLead } from "@/lib/data/quotation-repository";
import { humanizeList } from "@/lib/labels";
import { getNextBestAction } from "@/lib/next-best-action";
import { getOpenAiBrainRuntime } from "@/lib/openai-brain-config";
import { getWhatsAppRuntime } from "@/lib/whatsapp-config";
import type { AiDraftReviewStatus, AiDryRunRecommendation, LeadStatus } from "@/lib/types";

const statuses: LeadStatus[] = [
  "New Enquiry",
  "Awaiting Client",
  "Waiting Boss Approval",
  "Ready To Book",
  "Appointment Pending",
  "Quotation Readiness",
  "Follow Up Due",
  "Not Suitable"
];

const aiReviewActions: Array<{
  status: Exclude<AiDraftReviewStatus, "pending">;
  label: string;
  tone: "primary" | "muted" | "danger";
}> = [
  { status: "saved", label: "Save AI draft", tone: "primary" },
  { status: "marked_useful", label: "Mark useful", tone: "muted" },
  { status: "marked_not_useful", label: "Mark not useful", tone: "muted" },
  { status: "needs_edit", label: "Needs edit", tone: "muted" },
  { status: "rejected_unsafe", label: "Reject unsafe", tone: "danger" },
  { status: "copied", label: "Copy draft reply", tone: "muted" }
];

function getAiStatus(openAi: ReturnType<typeof getOpenAiBrainRuntime>) {
  if (!openAi.dryRunEnabled) return "Off";
  if (!openAi.canCallOpenAi) return "Dry-run fallback";
  return "Dry-run active";
}

function getValidationDisplay(recommendation: AiDryRunRecommendation) {
  if (!recommendation.validation.ok) {
    return {
      label: "Rejected",
      reasons: recommendation.validation.errors.length
        ? recommendation.validation.errors
        : ["The draft failed safety validation and should not be used."],
      fallback: "Fallback message shown instead of unsafe AI output."
    };
  }

  const reasons = [
    "Structured dry-run recommendation was validated before display.",
    "Boss approval is required before any client-facing use.",
    "No external send, WhatsApp action, calendar booking, or pricing action is allowed."
  ];
  if (recommendation.provider === "safe_fallback") {
    reasons.push("Safe fallback was used because OpenAI was unavailable, disabled, or invalid.");
  }
  return {
    label: "Passed",
    reasons,
    fallback: recommendation.provider === "safe_fallback" ? "Safe fallback draft is displayed." : ""
  };
}

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated) return null;

  const lead = (await getLeadById(params.id)) ?? (await getLeadById("lead-001"));
  if (!lead) return null;
  const readiness = await getQuotationReadinessForLead(lead.id);
  const aiRecommendation = await getLatestAiRecommendationForLead(lead.id);
  const leadMessages = await listLeadMessages(lead.id);
  const whatsappAuditTrail = (await listAuditLogs({ entityType: "lead", entityId: lead.id }))
    .filter((entry) => entry.action.startsWith("whatsapp_"))
    .slice(0, 8);
  const openAi = getOpenAiBrainRuntime();
  const whatsapp = getWhatsAppRuntime();
  const next = getNextBestAction(lead);
  const aiStatus = getAiStatus(openAi);
  const validationDisplay = aiRecommendation ? getValidationDisplay(aiRecommendation) : null;

  return (
    <>
      <PageHeader title="Lead Detail" eyebrow={lead.clientName}>
        <form action={markBossApprovalNeededAction}>
          <input type="hidden" name="lead_id" value={lead.id} />
          <ActionButton type="submit">Approve Reply</ActionButton>
        </form>
        <form action={updateLeadStatusAction}>
          <input type="hidden" name="lead_id" value={lead.id} />
          <input type="hidden" name="status" value="Appointment Pending" />
          <ActionButton type="submit" tone="muted">Book Appointment</ActionButton>
        </form>
        <form action={moveLeadToQuotationReadinessAction}>
          <input type="hidden" name="lead_id" value={lead.id} />
          <ActionButton type="submit" tone="muted">Move to Quotation Review</ActionButton>
        </form>
      </PageHeader>
      <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="rounded border border-command-line bg-command-panel p-5 shadow-command">
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={lead.leadCategory} />
            <StatusBadge label={lead.status} />
            {lead.bossApprovalNeeded ? <StatusBadge label="Boss Approval Needed" /> : null}
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-command-muted">Phone / Source</dt><dd>{lead.phone} | {lead.source}</dd></div>
            <div><dt className="text-command-muted">Division</dt><dd>{lead.division}</dd></div>
            <div><dt className="text-command-muted">Property Type</dt><dd>{lead.propertyType}</dd></div>
            <div><dt className="text-command-muted">Service Type</dt><dd>{lead.serviceType}</dd></div>
            <div className="sm:col-span-2"><dt className="text-command-muted">Scope Summary</dt><dd>{lead.scopeSummary}</dd></div>
            <div><dt className="text-command-muted">Missing Info</dt><dd>{humanizeList(lead.missingInfo)}</dd></div>
            <div><dt className="text-command-muted">Risk Flags</dt><dd>{humanizeList(lead.riskFlags)}</dd></div>
            <div><dt className="text-command-muted">Preferred Contact</dt><dd>{lead.preferredContactTime || "Not provided"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-command-muted">Next Best Action</dt><dd>{next.action}</dd></div>
            <div className="sm:col-span-2"><dt className="text-command-muted">Reason</dt><dd>{next.reason}</dd></div>
            <div className="sm:col-span-2"><dt className="text-command-muted">Blockers</dt><dd>{humanizeList(next.blockers)}</dd></div>
          </dl>
          <form action={updateLeadStatusAction} className="mt-5 flex flex-wrap items-end gap-3 rounded border border-command-line bg-command-panel2 p-4">
            <input type="hidden" name="lead_id" value={lead.id} />
            <label className="grid gap-1 text-sm">
              <span className="text-command-muted">Update status</span>
              <select name="status" defaultValue={lead.status} className="rounded border border-command-line bg-command-bg px-3 py-2 text-command-text">
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <ActionButton type="submit">Save Status</ActionButton>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={markBossApprovalNeededAction}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <ActionButton type="submit" tone="muted">Mark Boss Approval Needed</ActionButton>
            </form>
            <form action={markLeadNotSuitableAction}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <ActionButton type="submit" tone="danger">Mark Not Suitable</ActionButton>
            </form>
          </div>
        </div>
        <aside className="rounded border border-command-line bg-command-panel p-5 shadow-command">
          <h3 className="text-lg font-semibold">Readiness</h3>
          <p className="mt-4 text-sm text-command-muted">Appointment readiness</p>
          <p className="text-3xl font-semibold">{lead.appointmentReadiness}%</p>
          <p className="mt-4 text-sm text-command-muted">Quotation readiness</p>
          <p className="text-3xl font-semibold">{readiness?.readinessScore ?? lead.quotationReadiness}%</p>
          <div className="mt-5 space-y-2 text-sm">
            {readiness?.quotePreparationChecklist.map((item) => (
              <div key={item.item} className="flex justify-between gap-3 border-b border-command-line pb-2">
                <span>{item.item}</span>
                <span className={item.status === "complete" ? "text-command-green" : "text-command-amber"}>{item.status}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>
      <section className="mt-6 rounded border border-command-line bg-command-panel p-5 shadow-command">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-command-cyan">WhatsApp Closed Test</p>
            <h2 className="mt-1 text-xl font-semibold">Inbound and auto-reply audit</h2>
            <p className="mt-2 max-w-3xl text-sm text-command-muted">
              {whatsapp.statusLabel}. This section shows WhatsApp messages saved for this lead and any closed-test auto-reply status.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {[
              "WhatsApp live closed test mode",
              "Public auto-reply disabled",
              "No pricing / no Calendar booking"
            ].map((label) => (
              <span key={label} className="rounded border border-command-line bg-command-panel2 px-3 py-1 text-command-muted">
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-3">
            {leadMessages.length ? leadMessages.map((message) => (
              <div key={message.id} className="rounded border border-command-line bg-command-panel2 p-4">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-command-muted">
                  <span>{message.direction === "inbound" ? "Inbound client message" : "Outbound auto-reply"}</span>
                  <span>Status: {message.whatsappStatus || "recorded"}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{message.body}</p>
                <p className="mt-2 text-xs text-command-muted">
                  Provider message id: {message.providerMessageId || "Not provided"} | {message.createdAt}
                </p>
              </div>
            )) : (
              <p className="rounded border border-command-line bg-command-panel2 p-4 text-sm text-command-muted">
                No WhatsApp messages saved for this lead yet.
              </p>
            )}
          </div>
          <aside className="rounded border border-command-line bg-command-panel2 p-4">
            <p className="text-sm font-semibold">Auto-reply audit trail</p>
            <div className="mt-3 space-y-3">
              {whatsappAuditTrail.length ? whatsappAuditTrail.map((entry) => (
                <div key={entry.id} className="border-b border-command-line pb-3 text-sm last:border-b-0">
                  <p className="font-semibold">{entry.action}</p>
                  <p className="text-command-muted">{entry.summary}</p>
                  <p className="mt-1 text-xs text-command-muted">{entry.createdAt}</p>
                </div>
              )) : (
                <p className="text-sm text-command-muted">No WhatsApp audit events for this lead yet.</p>
              )}
            </div>
          </aside>
        </div>
      </section>
      <section className="mt-6 rounded border border-command-line bg-command-panel p-5 shadow-command">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-command-cyan">OpenAI Brain Dry-Run</p>
            <h2 className="mt-1 text-xl font-semibold">Draft only — boss approval required</h2>
            <p className="mt-2 max-w-3xl text-sm text-command-muted">
              {openAi.label}. This panel can only prepare structured recommendations for Marcus review.
              It cannot send messages, book appointments, bypass approval gates, or create pricing.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
              {[
                `AI status: ${aiStatus}`,
                "No auto-send",
                "No WhatsApp sending",
                "No Calendar booking",
                "No pricing generated",
                "Boss approval required"
              ].map((label) => (
                <span key={label} className="rounded border border-command-line bg-command-panel2 px-3 py-1 text-command-muted">
                  {label}
                </span>
              ))}
            </div>
          </div>
          <form action={generateAiDryRunRecommendationAction}>
            <input type="hidden" name="lead_id" value={lead.id} />
            <ActionButton type="submit" tone="muted" disabled={!openAi.dryRunEnabled}>
              {openAi.dryRunEnabled ? "Generate Dry-Run Draft" : "Dry-Run Off"}
            </ActionButton>
          </form>
        </div>
        {aiRecommendation ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded border border-command-line bg-command-panel2 p-4">
                <p className="text-sm font-semibold text-command-amber">{aiRecommendation.draftNotice}</p>
                <dl className="mt-3 grid gap-3 text-sm">
                  <div><dt className="text-command-muted">AI status</dt><dd>{aiStatus}</dd></div>
                  <div><dt className="text-command-muted">Recommendation category</dt><dd>{aiRecommendation.decision.lead_category}</dd></div>
                  <div><dt className="text-command-muted">Provider</dt><dd>{aiRecommendation.provider}</dd></div>
                  <div><dt className="text-command-muted">Model</dt><dd>{aiRecommendation.model}</dd></div>
                  <div><dt className="text-command-muted">Review status</dt><dd>{aiRecommendation.reviewStatus ?? "pending"}</dd></div>
                  <div><dt className="text-command-muted">Risk Flags</dt><dd>{humanizeList(aiRecommendation.decision.risk_flags)}</dd></div>
                  <div><dt className="text-command-muted">Missing Information</dt><dd>{humanizeList(aiRecommendation.decision.missing_info)}</dd></div>
                  <div><dt className="text-command-muted">Suggested Next Best Action</dt><dd>{next.action}</dd></div>
                </dl>
              </div>
              <div className="rounded border border-command-line bg-command-panel2 p-4">
                <p className="text-sm text-command-muted">Internal boss note</p>
                <p className="mt-2 text-sm">{aiRecommendation.decision.internal_notes}</p>
                <p className="mt-4 text-sm text-command-muted">Draft client reply</p>
                <p className="mt-2 whitespace-pre-wrap rounded border border-command-line bg-command-bg p-3 text-sm">
                  {aiRecommendation.decision.client_reply}
                </p>
              </div>
            </div>
            <div className="rounded border border-command-line bg-command-panel2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Validation result: {validationDisplay?.label}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-command-muted">
                    {validationDisplay?.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                  {validationDisplay?.fallback ? (
                    <p className="mt-3 text-sm text-command-amber">{validationDisplay.fallback}</p>
                  ) : null}
                </div>
                <StatusBadge label={aiRecommendation.validation.ok ? "Safe Draft" : "Rejected"} />
              </div>
            </div>
            <div className="rounded border border-command-line bg-command-panel2 p-4">
              <p className="text-sm font-semibold">Boss review actions</p>
              <p className="mt-1 text-sm text-command-muted">
                These actions only record Marcus review decisions and audit logs. They do not send messages, trigger WhatsApp,
                book Calendar events, or create pricing.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {aiReviewActions.map((reviewAction) => (
                  <form key={reviewAction.status} action={reviewAiDraftAction}>
                    <input type="hidden" name="lead_id" value={lead.id} />
                    <input type="hidden" name="recommendation_id" value={aiRecommendation.id ?? ""} />
                    <input type="hidden" name="review_status" value={reviewAction.status} />
                    <ActionButton type="submit" tone={reviewAction.tone} disabled={!aiRecommendation.id}>
                      {reviewAction.label}
                    </ActionButton>
                  </form>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-5 rounded border border-command-line bg-command-panel2 p-4 text-sm text-command-muted">
            No AI dry-run recommendation saved for this lead yet. Keep OpenAI off unless Marcus intentionally enables dry-run mode.
          </p>
        )}
      </section>
    </>
  );
}
