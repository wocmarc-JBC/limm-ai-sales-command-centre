import { ActionButton } from "@/components/ActionButton";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
  approveAppointmentBookingAction,
  archiveLeadAction,
  generateAiDryRunRecommendationAction,
  hardDeleteLeadAction,
  markFollowedUpAction,
  markBossApprovalNeededAction,
  markLeadDuplicateAction,
  markLeadSpamAction,
  markLeadTestAction,
  markLeadNotSuitableAction,
  markNeedsMarcusAction,
  moveLeadToQuotationReadinessAction,
  pauseBotForLeadAction,
  requestAppointmentMissingInfoAction,
  requestAppointmentReviewAction,
  requestCalendarEventCreateAction,
  restoreLeadAction,
  resumeBotForLeadAction,
  reviewAiDraftAction,
  softDeleteLeadAction,
  takeOverLeadAction,
  updateLeadStatusAction
} from "@/lib/actions";
import { evaluateBookingReadiness } from "@/lib/calendar-booking";
import { getCalendarRuntime } from "@/lib/calendar-config";
import { getCurrentProfile } from "@/lib/auth/session";
import { getLatestAiRecommendationForLead } from "@/lib/data/ai-decisions-repository";
import { listAuditLogs } from "@/lib/data/audit-repository";
import { listLeadMessages } from "@/lib/data/lead-messages-repository";
import { getLeadById } from "@/lib/data/leads-repository";
import { getQuotationReadinessForLead } from "@/lib/data/quotation-repository";
import { humanizeLabel, humanizeList } from "@/lib/labels";
import { getNextBestAction } from "@/lib/next-best-action";
import { getOpenAiBrainRuntime } from "@/lib/openai-brain-config";
import { buildConversationSummary, buildFollowUpReminder, calculateLeadLevel, missionForLead, readinessStatus } from "@/lib/sales-control";
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
  const calendar = getCalendarRuntime();
  const next = getNextBestAction(lead);
  const leadLevel = lead.leadLevel ?? calculateLeadLevel(lead);
  const leadMission = lead.missionCategory || missionForLead(lead);
  const aiStatus = getAiStatus(openAi);
  const validationDisplay = aiRecommendation ? getValidationDisplay(aiRecommendation) : null;
  const latestInbound = leadMessages.find((message) => message.direction === "inbound" && message.channel === "whatsapp");
  const latestOutbound = leadMessages.find((message) => message.direction === "outbound" && message.channel === "whatsapp");
  const brainMetadata = latestOutbound?.metadata ?? {};
  const bookingReadiness = evaluateBookingReadiness({
    lead,
    latestText: latestInbound?.body ?? lead.lastClientMessage,
    bossApproved: lead.status === "Ready To Book"
  });
  const brainStatus = latestOutbound?.whatsappStatus || "No auto-reply yet";
  const metadataText = (key: string, fallback = "Not available") => {
    const value = brainMetadata[key];
    if (Array.isArray(value)) return value.length ? value.map(String).map(humanizeLabel).join(", ") : "None";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return String(value);
    if (typeof value === "string" && value) return humanizeLabel(value);
    return fallback;
  };

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
            <StatusBadge label={leadLevel} />
            <StatusBadge label={leadMission} />
            <StatusBadge label={lead.status} />
            {lead.bossApprovalNeeded ? <StatusBadge label="Boss Approval Needed" /> : null}
            {lead.needsMarcus ? <StatusBadge label="Needs Marcus" /> : null}
            {lead.botPaused ? <StatusBadge label="Bot Paused" /> : null}
            {lead.deletedAt ? <StatusBadge label="Soft Deleted" /> : null}
            {lead.archivedAt ? <StatusBadge label="Archived" /> : null}
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
            <div className="sm:col-span-2"><dt className="text-command-muted">Conversation Summary</dt><dd>{lead.conversationSummary || buildConversationSummary(lead)}</dd></div>
            <div><dt className="text-command-muted">Readiness Status</dt><dd>{readinessStatus(lead)}</dd></div>
            <div><dt className="text-command-muted">Follow-Up Reminder</dt><dd>{buildFollowUpReminder(lead)}</dd></div>
            <div><dt className="text-command-muted">Assigned To</dt><dd>{lead.assignedTo || "Unassigned"}</dd></div>
            <div><dt className="text-command-muted">Bot Control</dt><dd>{lead.botPaused ? `Paused - ${lead.botPauseReason || "Manual"}` : "Active"}</dd></div>
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
          <div className="mt-5 rounded border border-command-line bg-command-panel2 p-4">
            <p className="text-sm font-semibold text-command-text">Human takeover and cleanup controls</p>
            <p className="mt-1 text-sm text-command-muted">
              Normal delete is soft delete. Permanent delete is boss/admin only, requires prior soft delete, typed confirmation, reason, and an audit before deletion.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={takeOverLeadAction}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <ActionButton type="submit" tone="muted">Take Over Lead</ActionButton>
              </form>
              <form action={pauseBotForLeadAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input name="reason" placeholder="Pause reason" className="rounded border border-command-line bg-command-bg px-3 py-2 text-sm text-command-text" />
                <ActionButton type="submit" tone="muted">Pause Bot</ActionButton>
              </form>
              <form action={resumeBotForLeadAction}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <ActionButton type="submit" tone="muted">Resume Bot</ActionButton>
              </form>
              <form action={markNeedsMarcusAction}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <input type="hidden" name="reason" value="Marked from lead detail." />
                <ActionButton type="submit" tone="muted">Mark Needs Marcus</ActionButton>
              </form>
              <form action={markFollowedUpAction}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <ActionButton type="submit" tone="muted">Mark Followed Up</ActionButton>
              </form>
              <form action={markLeadTestAction}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <ActionButton type="submit" tone="muted">Mark Test Lead</ActionButton>
              </form>
              <form action={markLeadSpamAction}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <ActionButton type="submit" tone="danger">Mark Spam</ActionButton>
              </form>
              <form action={markLeadDuplicateAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input name="duplicate_of" placeholder="Duplicate of lead id" className="rounded border border-command-line bg-command-bg px-3 py-2 text-sm text-command-text" />
                <ActionButton type="submit" tone="muted">Mark Duplicate</ActionButton>
              </form>
              <form action={archiveLeadAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input name="reason" placeholder="Archive reason" className="rounded border border-command-line bg-command-bg px-3 py-2 text-sm text-command-text" />
                <ActionButton type="submit" tone="muted">Archive Lead</ActionButton>
              </form>
              <form action={softDeleteLeadAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input name="reason" placeholder="Soft delete reason" className="rounded border border-command-line bg-command-bg px-3 py-2 text-sm text-command-text" />
                <ActionButton type="submit" tone="danger">Soft Delete Lead</ActionButton>
              </form>
              <form action={restoreLeadAction}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <ActionButton type="submit" tone="muted">Restore Lead</ActionButton>
              </form>
            </div>
            <form action={hardDeleteLeadAction} className="mt-4 grid gap-2 rounded border border-command-red/60 bg-command-bg p-3 md:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="lead_id" value={lead.id} />
              <input name="reason" placeholder="Permanent delete reason" className="rounded border border-command-line bg-command-bg px-3 py-2 text-sm text-command-text" />
              <input name="confirmation" placeholder="Type PERMANENT DELETE" className="rounded border border-command-line bg-command-bg px-3 py-2 text-sm text-command-text" />
              <ActionButton type="submit" tone="danger" disabled={!lead.deletedAt}>Permanent Delete</ActionButton>
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
            <p className="text-xs uppercase tracking-[0.24em] text-command-cyan">WhatsApp Auto-Reply</p>
            <h2 className="mt-1 text-xl font-semibold">Inbound and auto-reply audit</h2>
            <p className="mt-2 max-w-3xl text-sm text-command-muted">
              {whatsapp.statusLabel}. This section shows WhatsApp messages saved for this lead and any auto-reply status.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {[
              whatsapp.liveAutoReplyApproved ? "Marcus-approved live mode" : "Closed test mode available",
              whatsapp.publicAutoReplyEnabled ? "Public auto-reply enabled by Marcus" : "Public auto-reply disabled",
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
      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="rounded border border-command-line bg-command-panel p-5 shadow-command">
          <p className="text-xs uppercase tracking-[0.24em] text-command-cyan">WhatsApp Sales Brain</p>
          <h2 className="mt-1 text-xl font-semibold">Reply intelligence and safety metadata</h2>
          <p className="mt-2 text-sm text-command-muted">
            This shows the latest WhatsApp reply decision if the v5 sales brain has processed this lead. Every live reply still passes safety,
            repetition, tone, and Calendar confirmation checks before sending.
          </p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-command-muted">Latest inbound WhatsApp</dt><dd>{latestInbound?.body ?? "No inbound WhatsApp message yet"}</dd></div>
            <div><dt className="text-command-muted">Latest outbound WhatsApp</dt><dd>{latestOutbound?.body ?? "No outbound auto-reply yet"}</dd></div>
            <div><dt className="text-command-muted">Auto-reply status</dt><dd>{humanizeLabel(brainStatus)}</dd></div>
            <div><dt className="text-command-muted">Reply source</dt><dd>{metadataText("reply_source")}</dd></div>
            <div><dt className="text-command-muted">Matched question intent</dt><dd>{metadataText("question_bank_intent")}</dd></div>
            <div><dt className="text-command-muted">Latest question bank category</dt><dd>{metadataText("latest_question_bank_category")}</dd></div>
            <div><dt className="text-command-muted">Reply strategy</dt><dd>{metadataText("reply_strategy")}</dd></div>
            <div><dt className="text-command-muted">Escalation required</dt><dd>{metadataText("escalation_required")}</dd></div>
            <div><dt className="text-command-muted">Escalation reason</dt><dd>{metadataText("escalation_reason", "None")}</dd></div>
            <div><dt className="text-command-muted">Intent</dt><dd>{metadataText("intent")}</dd></div>
            <div><dt className="text-command-muted">Confidence</dt><dd>{metadataText("confidence")}</dd></div>
            <div><dt className="text-command-muted">Next best action</dt><dd>{metadataText("next_best_action")}</dd></div>
            <div><dt className="text-command-muted">Safety result</dt><dd>{metadataText("safety_result")}</dd></div>
            <div><dt className="text-command-muted">Tone result</dt><dd>{metadataText("tone_result")}</dd></div>
            <div><dt className="text-command-muted">Repetition result</dt><dd>{metadataText("repetition_result")}</dd></div>
            <div><dt className="text-command-muted">Appointment intent</dt><dd>{metadataText("appointment_intent")}</dd></div>
            <div><dt className="text-command-muted">Booking readiness</dt><dd>{metadataText("booking_readiness", humanizeLabel(bookingReadiness.status))}</dd></div>
            <div className="sm:col-span-2"><dt className="text-command-muted">Blocked reason</dt><dd>{metadataText("blocked_reason", "None")}</dd></div>
          </dl>
        </div>
        <aside className="rounded border border-command-line bg-command-panel p-5 shadow-command">
          <p className="text-xs uppercase tracking-[0.24em] text-command-cyan">Calendar Foundation</p>
          <h2 className="mt-1 text-xl font-semibold">Boss-approved booking only</h2>
          <p className="mt-2 text-sm text-command-muted">
            Do not confirm booking until event is created. Calendar is disabled by default and auto booking is disabled.
          </p>
          <dl className="mt-5 space-y-3 text-sm">
            <div><dt className="text-command-muted">Calendar status</dt><dd>{humanizeLabel(calendar.status)}</dd></div>
            <div><dt className="text-command-muted">Boss approval required</dt><dd>{calendar.bossApprovalRequired ? "Yes" : "No"}</dd></div>
            <div><dt className="text-command-muted">Auto booking enabled</dt><dd>{calendar.autoBookingEnabled ? "Yes" : "No"}</dd></div>
            <div><dt className="text-command-muted">Appointment type</dt><dd>{humanizeLabel(bookingReadiness.appointmentType)}</dd></div>
            <div><dt className="text-command-muted">Booking readiness</dt><dd>{humanizeLabel(bookingReadiness.status)}</dd></div>
            <div><dt className="text-command-muted">Missing booking info</dt><dd>{humanizeList(bookingReadiness.missingInfo)}</dd></div>
            <div><dt className="text-command-muted">Safety note</dt><dd>{bookingReadiness.safetyNote}</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <form action={requestAppointmentReviewAction}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <ActionButton type="submit" tone="muted">Mark Ready for Appointment Review</ActionButton>
            </form>
            <form action={approveAppointmentBookingAction}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <ActionButton type="submit" tone="muted">Approve Booking</ActionButton>
            </form>
            <form action={requestAppointmentMissingInfoAction}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <ActionButton type="submit" tone="muted">Reject / Need More Info</ActionButton>
            </form>
            <form action={requestCalendarEventCreateAction}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <ActionButton type="submit" tone="muted" disabled={!bookingReadiness.canCreateCalendarEvent}>
                {bookingReadiness.canCreateCalendarEvent ? "Create Calendar Event" : "Calendar Connection Not Enabled"}
              </ActionButton>
            </form>
          </div>
        </aside>
      </section>
      <section className="mt-6 rounded border border-command-line bg-command-panel p-5 shadow-command">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-command-cyan">OpenAI Brain Dry-Run</p>
            <h2 className="mt-1 text-xl font-semibold">Draft only - boss approval required</h2>
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
