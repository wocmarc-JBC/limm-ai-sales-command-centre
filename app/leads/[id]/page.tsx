import { ActionButton } from "@/components/ActionButton";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
  approveAppointmentBookingAction,
  archiveLeadAction,
  createQuotationPackageAction,
  createLeadUploadLinkAction,
  generateAiDryRunRecommendationAction,
  hardDeleteLeadAction,
  markLeadFileReviewedAction,
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
  saveLeadIntakeProfileAction,
  softDeleteLeadAction,
  takeOverLeadAction,
  updateLeadStatusAction,
  voidLeadFileAction
} from "@/lib/actions";
import { evaluateBookingReadiness } from "@/lib/calendar-booking";
import { getCalendarRuntime } from "@/lib/calendar-config";
import { getCurrentProfile } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getLatestAiRecommendationForLead } from "@/lib/data/ai-decisions-repository";
import { listAuditLogs } from "@/lib/data/audit-repository";
import {
  LEAD_FILE_CATEGORIES,
  getSignedLeadFileUrl,
  listLeadFiles,
  listLeadUploadLinks
} from "@/lib/data/lead-files-repository";
import { listLeadMessages } from "@/lib/data/lead-messages-repository";
import { getLeadById } from "@/lib/data/leads-repository";
import { getQuotationReadinessForLead } from "@/lib/data/quotation-repository";
import { listQuotationPackagesForLead } from "@/lib/data/quotation-repository";
import { humanizeLabel, humanizeList } from "@/lib/labels";
import { buildLeadIntakePlan, MAX_INTAKE_QUESTIONS } from "@/lib/lead-intake";
import { formatLeadDisplayName } from "@/lib/lead-display";
import { getNextBestAction } from "@/lib/next-best-action";
import { getOpenAiBrainRuntime } from "@/lib/openai-brain-config";
import { buildConversationSummary, buildFollowUpReminder, calculateLeadLevel, missionForLead, readinessStatus } from "@/lib/sales-control";
import { money } from "@/lib/sales-collection";
import { inferLeadLocation } from "@/lib/singapore-location";
import type { AiDraftReviewStatus, AiDryRunRecommendation, LeadFileCategory, LeadMessage, LeadStatus } from "@/lib/types";

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

const fileCategoryLabels: Record<LeadFileCategory, string> = {
  floor_plan: "Floor Plan",
  site_photos: "Site Photos",
  reference_images: "Reference Images",
  existing_quotation: "Existing Quotation",
  building_rules: "Building Rules",
  other_documents: "Other Documents"
};

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

const quotationInputClass = "rounded-md border border-command-line bg-command-bg px-3 py-2 text-base text-command-text";
type DeleteStatus = "softDeleted" | "permissionDenied" | "restored" | "hardDeleted" | "failed";
type QuotationStatus = "failed";

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

export default async function LeadDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: {
    uploadLink?: string;
    metaMessageId?: string;
    deleteStatus?: DeleteStatus;
    quotationStatus?: QuotationStatus;
    message?: string;
    created?: string;
  };
}) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated) return null;
  if (!auth.profile) return null;

  const lead = (await getLeadById(params.id)) ?? (await getLeadById("lead-001"));
  if (!lead) return null;
  const role = auth.profile.role;
  const canSoftDelete = can(role, "soft_delete_leads");
  const canRestore = can(role, "restore_leads");
  const canHardDelete = can(role, "hard_delete_leads");
  const hardDeleteEnabled = canHardDelete && Boolean(lead.deletedAt);
  const deleteFeedback: Record<DeleteStatus, { title: string; body: string; tone: string }> = {
    softDeleted: {
      title: "Lead soft-deleted",
      body: "The lead was archived from active command queues. Permanent delete is still blocked unless boss/admin confirms it separately.",
      tone: "border-command-green/50 bg-command-green/10 text-command-green"
    },
    permissionDenied: {
      title: "Permission denied",
      body: "Your current role cannot perform that delete/archive action. Ask a boss/admin to do it.",
      tone: "border-command-red/60 bg-command-red/10 text-command-red"
    },
    restored: {
      title: "Lead restored",
      body: "The lead was restored to active command queues.",
      tone: "border-command-green/50 bg-command-green/10 text-command-green"
    },
    hardDeleted: {
      title: "Lead permanently deleted",
      body: "The permanent delete action completed after boss/admin confirmation.",
      tone: "border-command-red/60 bg-command-red/10 text-command-red"
    },
    failed: {
      title: "Delete action failed",
      body: "Permanent delete requires boss/admin permission, prior soft delete, a reason, and exact confirmation: PERMANENT DELETE.",
      tone: "border-command-amber/60 bg-command-amber/10 text-command-amber"
    }
  };
  const activeDeleteFeedback = searchParams?.deleteStatus ? deleteFeedback[searchParams.deleteStatus] : null;
  const quotationFailureMessage =
    searchParams?.quotationStatus === "failed"
      ? searchParams.message || "Quotation package was not created. Please check the file and try again."
      : "";
  const readiness = await getQuotationReadinessForLead(lead.id);
  const quotationPackages = await listQuotationPackagesForLead(lead.id, { includeTestDemo: true });
  const latestQuotation = quotationPackages[0] ?? null;
  const aiRecommendation = await getLatestAiRecommendationForLead(lead.id);
  const leadMessages = await listLeadMessages(lead.id);
  const leadFiles = await listLeadFiles(lead.id);
  const leadUploadLinks = await listLeadUploadLinks(lead.id);
  const signedFileUrls = new Map<string, string>(
    await Promise.all(
      leadFiles
        .filter((file) => file.fileStatus !== "voided")
        .map(async (file) => [file.id, await getSignedLeadFileUrl(file.id)] as const)
    )
  );
  const whatsappAuditTrail = (await listAuditLogs({ entityType: "lead", entityId: lead.id }))
    .filter((entry) => entry.action.startsWith("whatsapp_"))
    .slice(0, 8);
  const openAi = getOpenAiBrainRuntime();
  const calendar = getCalendarRuntime();
  const next = getNextBestAction(lead);
  const leadLevel = lead.leadLevel ?? calculateLeadLevel(lead);
  const leadMission = lead.missionCategory || missionForLead(lead);
  const aiStatus = getAiStatus(openAi);
  const validationDisplay = aiRecommendation ? getValidationDisplay(aiRecommendation) : null;
  const latestInbound = leadMessages.find((message) => message.direction === "inbound" && message.channel === "whatsapp");
  const latestOutbound = leadMessages.find((message) => message.direction === "outbound" && message.channel === "whatsapp");
  const conversationMessages = [...leadMessages]
    .filter((message) => message.channel === "whatsapp")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const brainMetadata = latestOutbound?.metadata ?? {};
  const intakePlan = buildLeadIntakePlan(lead, leadMessages);
  const intakeProfile = intakePlan.profile;
  const bookingReadiness = evaluateBookingReadiness({
    lead,
    latestText: latestInbound?.body ?? lead.lastClientMessage,
    bossApproved: lead.status === "Ready To Book"
  });
  const brainStatus = latestOutbound?.whatsappStatus || "No auto-reply yet";
  const displayName = formatLeadDisplayName(lead);
  const leadLocation = inferLeadLocation(lead);
  const visibleLeadFiles = leadFiles.filter((file) => file.fileStatus !== "voided");
  const nowIso = new Date().toISOString();
  const activeUploadLinks = leadUploadLinks.filter((link) => link.isActive && link.expiresAt >= nowIso);
  const hasFloorPlanFile = visibleLeadFiles.some((file) => file.fileCategory === "floor_plan");
  const hasSitePhotosFile = visibleLeadFiles.some((file) => file.fileCategory === "site_photos");
  const metadataText = (key: string, fallback = "Not available") => {
    const value = brainMetadata[key];
    if (Array.isArray(value)) return value.length ? value.map(String).map(humanizeLabel).join(", ") : "None";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return String(value);
    if (typeof value === "string" && value) return humanizeLabel(value);
    return fallback;
  };
  const commandTimeline = [
    ...leadMessages.slice(0, 5).map((message) => ({
      id: `message-${message.id}`,
      at: message.createdAt,
      title: message.direction === "inbound" ? "Client message received" : "Bot reply recorded",
      detail: message.body || "Message body not available"
    })),
    ...whatsappAuditTrail.slice(0, 5).map((entry) => ({
      id: `audit-${entry.id}`,
      at: entry.createdAt,
      title: humanizeLabel(entry.action),
      detail: entry.summary || "Audit event recorded"
    }))
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);

  return (
    <>
      <PageHeader title={displayName} eyebrow="Lead Detail">
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
      {searchParams?.created ? (
        <section className="mb-6 rounded-xl border border-command-green/50 bg-command-green/10 p-4 text-command-green" data-testid="manual-lead-created-feedback">
          <p className="font-semibold">Manual lead created.</p>
          <p className="mt-1 text-sm">No WhatsApp/email/calendar action was sent.</p>
        </section>
      ) : null}
      <section className="mt-6 rounded-lg border border-command-cyan/25 bg-command-card p-6 shadow-premium">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-cyan">WhatsApp Conversation</p>
            <h2 className="mt-1 text-xl font-semibold text-command-text">Read-only lead view</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-command-muted">
              Manual WhatsApp replies now happen only in the WhatsApp Inbox to avoid duplicate send paths and stuck pending states.
            </p>
          </div>
          <a
            href={`/inbox?lead=${encodeURIComponent(lead.id)}`}
            className="inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black transition hover:bg-command-goldHover"
          >
            Reply in WhatsApp Inbox
          </a>
        </div>
        <div className="mt-5 space-y-3">
          {conversationMessages.slice(-5).map((message) => (
            <div key={message.id} className="rounded-xl border border-command-line bg-command-bg/55 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-command-muted">
                <span className="font-semibold uppercase tracking-[0.14em]">
                  {message.direction === "inbound" ? "Client" : message.metadata?.manualReply ? "Marcus" : "AI / system"}
                </span>
                <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("en-SG")}</time>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-command-text">{message.body || "Message body not available."}</p>
            </div>
          ))}
          {conversationMessages.length === 0 ? (
            <p className="rounded-xl border border-command-line bg-command-bg/55 p-4 text-sm text-command-muted">
              No WhatsApp messages saved for this lead yet.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-6 mission-panel rounded-2xl p-5" id="quotation-package">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-gold">Quotation Package Workflow</p>
            <h2 className="mt-1 text-2xl font-semibold text-command-text">
              {latestQuotation ? `${latestQuotation.quotationNumber} / v${latestQuotation.versionNumber}` : "Create quotation package"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-command-muted">
              File upload is optional. Create the quotation package without a file when needed, or upload the actual quotation document before boss review. No automated pricing is generated here.
            </p>
          </div>
          {latestQuotation ? (
            <a href={`/quotations/${latestQuotation.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-command-gold bg-command-gold px-4 py-2 text-base font-semibold text-black">
              Open Latest Quotation
            </a>
          ) : null}
        </div>

        {latestQuotation ? (
          <div className="mt-5 grid gap-3 text-sm md:grid-cols-4">
            <div className="rounded-xl border border-command-line bg-command-bg/55 p-3">
              <p className="text-command-muted">Status</p>
              <p className="mt-1 font-semibold text-command-text">{latestQuotation.status}</p>
            </div>
            <div className="rounded-xl border border-command-line bg-command-bg/55 p-3">
              <p className="text-command-muted">Amount</p>
              <p className="mt-1 font-semibold text-command-text">{money(latestQuotation.quotationAmount)}</p>
            </div>
            <div className="rounded-xl border border-command-line bg-command-bg/55 p-3">
              <p className="text-command-muted">File</p>
              <p className="mt-1 font-semibold text-command-text">{latestQuotation.originalFileName || "No file uploaded"}</p>
            </div>
            <div className="rounded-xl border border-command-line bg-command-bg/55 p-3">
              <p className="text-command-muted">Sent</p>
              <p className="mt-1 font-semibold text-command-text">{latestQuotation.sentAt || "Not sent"}</p>
            </div>
          </div>
        ) : null}

        {quotationFailureMessage ? (
          <div className="mt-5 rounded-xl border border-command-red/60 bg-command-red/10 p-4 text-command-red" data-testid="quotation-package-failed-feedback">
            <p className="font-semibold">Quotation package was not created</p>
            <p className="mt-1 text-sm">{quotationFailureMessage}</p>
          </div>
        ) : null}

        <form action={createQuotationPackageAction} className="mt-5 grid gap-4 md:grid-cols-2" data-testid="create-quotation-package-form">
          <input type="hidden" name="lead_id" value={lead.id} />
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Quotation number</span>
            <input name="quotation_number" placeholder="LIMM-Q-YYYY-###" className={quotationInputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Quotation amount</span>
            <input name="quotation_amount" type="number" min="0" step="1" defaultValue={lead.quotedAmount || lead.potentialValue || 0} className={quotationInputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted md:col-span-2">
            <span>Scope summary</span>
            <textarea name="scope_summary" defaultValue={lead.scopeSummary} rows={3} className={quotationInputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Prepared by</span>
            <input name="prepared_by" defaultValue={auth.profile?.fullName ?? "Marcus"} className={quotationInputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted">
            <span>Expiry date</span>
            <input name="expiry_date" type="date" defaultValue={lead.quoteExpiryDate?.slice(0, 10) ?? ""} className={quotationInputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted md:col-span-2">
            <span>Notes to boss</span>
            <textarea name="boss_notes" placeholder="Risk, scope assumptions, missing info, or revision notes" rows={3} className={quotationInputClass} />
          </label>
          <label className="grid gap-1 text-sm text-command-muted md:col-span-2">
            <span>Upload draft quotation</span>
            <input name="file" type="file" accept=".pdf,.xls,.xlsx,.doc,.docx,image/jpeg,image/png,image/webp" className={quotationInputClass} />
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <ActionButton type="submit" data-testid="create-quotation-package">Create Quotation Package</ActionButton>
            <a href="/quotations" className="inline-flex min-h-11 items-center rounded-md border border-command-line bg-command-elevated px-4 py-2 text-base font-semibold text-command-text">
              View Quotation History
            </a>
          </div>
        </form>
      </section>
      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
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
          {displayName !== lead.clientName ? (
            <p className="mt-4 rounded-xl border border-command-line bg-command-bg/55 px-4 py-3 text-sm text-command-muted">
              Generated CRM title cleaned for display. Original title is still preserved internally for audit/history.
            </p>
          ) : null}
          <div className="mt-5 rounded-lg border border-command-gold/35 bg-command-gold/10 p-4">
            <p className="text-sm uppercase tracking-[0.18em] text-command-gold">Next best action</p>
            <p className="mt-2 text-xl font-semibold text-command-text">{next.action}</p>
            <p className="mt-2 text-base text-command-muted">{next.reason}</p>
          </div>
          <dl className="mt-5 grid gap-4 text-base sm:grid-cols-2">
            <div><dt className="text-command-muted">Phone / Source</dt><dd>{lead.phone} | {lead.source}</dd></div>
            <div><dt className="text-command-muted">Division</dt><dd>{lead.division}</dd></div>
            <div><dt className="text-command-muted">Property Type</dt><dd>{lead.propertyType}</dd></div>
            <div><dt className="text-command-muted">Service Type</dt><dd>{lead.serviceType}</dd></div>
            <div className="sm:col-span-2"><dt className="text-command-muted">Scope Summary</dt><dd>{lead.scopeSummary}</dd></div>
            <div><dt className="text-command-muted">Missing Info</dt><dd>{humanizeList(lead.missingInfo)}</dd></div>
            <div><dt className="text-command-muted">Risk Flags</dt><dd>{humanizeList(lead.riskFlags)}</dd></div>
            <div><dt className="text-command-muted">Preferred Contact</dt><dd>{lead.preferredContactTime || "Not provided"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-command-muted">Blockers</dt><dd>{humanizeList(next.blockers)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-command-muted">Conversation Summary</dt><dd>{lead.conversationSummary || buildConversationSummary(lead)}</dd></div>
            <div><dt className="text-command-muted">Readiness Status</dt><dd>{readinessStatus(lead)}</dd></div>
            <div><dt className="text-command-muted">Follow-Up Reminder</dt><dd>{buildFollowUpReminder(lead)}</dd></div>
            <div><dt className="text-command-muted">Assigned To</dt><dd>{lead.assignedTo || "Unassigned"}</dd></div>
            <div><dt className="text-command-muted">Bot Control</dt><dd>{lead.botPaused ? `Paused - ${lead.botPauseReason || "Manual"}` : "Active"}</dd></div>
          </dl>
          <div className="mt-5 rounded-lg border border-command-line bg-command-elevated p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-cyan">Location Intelligence</p>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-command-muted">Property area</dt><dd>{lead.propertyArea || leadLocation.area}</dd></div>
              <div><dt className="text-command-muted">Planning region</dt><dd>{lead.planningRegion || leadLocation.region}</dd></div>
              <div><dt className="text-command-muted">Postal code</dt><dd>{lead.postalCode || leadLocation.postalCode || "Not provided"}</dd></div>
              <div><dt className="text-command-muted">Location confidence</dt><dd>{leadLocation.confidence}</dd></div>
              <div className="sm:col-span-2"><dt className="text-command-muted">Location notes</dt><dd>{lead.locationNotes || leadLocation.notes}</dd></div>
              {lead.projectAddress ? (
                <div className="sm:col-span-2"><dt className="text-command-muted">Stored address / area note</dt><dd>{lead.projectAddress}</dd></div>
              ) : null}
            </dl>
          </div>
          <section className="mt-5 rounded-lg border border-command-gold/35 bg-command-elevated p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-gold">Smart Lead Intake</p>
                <h2 className="mt-1 text-xl font-semibold text-command-text">Meeting prep checklist</h2>
                <p className="mt-2 max-w-3xl text-sm text-command-muted">
                  Collect lifestyle, occupants, helper, pets, safety needs, budget expectation, timeline, key collection, and move-in details
                  without giving prices or confirming bookings.
                </p>
              </div>
              <div className="flex gap-3">
                <div className="rounded-lg border border-command-line bg-command-bg/70 px-4 py-3 text-center">
                  <p className="text-xs uppercase tracking-[0.14em] text-command-muted">Meeting</p>
                  <p className="text-2xl font-semibold text-command-cyan">{intakePlan.meetingReadinessScore}%</p>
                </div>
                <div className="rounded-lg border border-command-line bg-command-bg/70 px-4 py-3 text-center">
                  <p className="text-xs uppercase tracking-[0.14em] text-command-muted">Proposal</p>
                  <p className="text-2xl font-semibold text-command-gold">{intakePlan.proposalReadinessScore}%</p>
                </div>
              </div>
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
              <div className="rounded-lg border border-command-line bg-command-bg/55 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-command-text">Collected intake</p>
                  <StatusBadge label={`${intakePlan.completedFields.length} fields ready`} />
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  {intakePlan.checklist.map((item) => (
                    <div key={item.key} className="rounded-md border border-command-line bg-command-panel2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-command-text">{item.label}</p>
                        <span className={item.status === "missing" ? "text-command-amber" : "text-command-green"}>
                          {humanizeLabel(item.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-command-muted">{item.value || "Not collected"}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-command-line bg-command-bg/55 p-4">
                <p className="font-semibold text-command-text">Ask only the next useful questions</p>
                <p className="mt-1 text-sm text-command-muted">
                  The intake brain caps the next ask to {MAX_INTAKE_QUESTIONS} questions, so Marcus does not overwhelm the client.
                </p>
                <ol className="mt-3 space-y-2 text-sm">
                  {intakePlan.suggestedQuestions.length ? intakePlan.suggestedQuestions.map((question) => (
                    <li key={question} className="rounded-md border border-command-line bg-command-panel2 p-3">
                      {question}
                    </li>
                  )) : (
                    <li className="rounded-md border border-command-green/50 bg-command-green/10 p-3 text-command-green">
                      Intake looks ready for Marcus to review before the initial project review.
                    </li>
                  )}
                </ol>
                <p className="mt-3 rounded-md border border-command-amber/45 bg-command-amber/10 p-3 text-sm text-command-muted">
                  Budget expectation is collected only as planning context. The CRM must not generate amounts, ranges, bundled cost claims, or early cost guesses.
                </p>
              </div>
            </div>
            <form action={saveLeadIntakeProfileAction} className="mt-5 grid gap-4 rounded-lg border border-command-line bg-command-bg/55 p-4 lg:grid-cols-3">
              <input type="hidden" name="lead_id" value={lead.id} />
              <label className="grid gap-1 text-sm">
                <span className="text-command-muted">Property type</span>
                <input name="property_type" defaultValue={intakeProfile.propertyType ?? ""} className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <label className="grid gap-1 text-sm lg:col-span-2">
                <span className="text-command-muted">Scope of work</span>
                <input name="scope_of_work" defaultValue={intakeProfile.scopeOfWork ?? ""} className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-command-muted">Floor plan status</span>
                <input name="floor_plan_status" defaultValue={intakeProfile.floorPlanStatus ?? ""} placeholder="Received / Not yet / Partial" className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-command-muted">Site photos status</span>
                <input name="site_photos_status" defaultValue={intakeProfile.sitePhotosStatus ?? ""} placeholder="Received / Not yet / Partial" className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-command-muted">Address or area</span>
                <input name="property_area_or_address" defaultValue={intakeProfile.propertyAreaOrAddress ?? ""} className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-command-muted">Lifestyle needs</span>
                <input name="lifestyle_notes" defaultValue={intakeProfile.lifestyleNotes ?? ""} className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-command-muted">Occupants</span>
                <input name="occupants" defaultValue={intakeProfile.occupants ?? ""} className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-command-muted">Helper</span>
                <input name="helper" defaultValue={intakeProfile.helper ?? ""} className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-command-muted">Pets</span>
                <input name="pets" defaultValue={intakeProfile.pets ?? ""} className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-command-muted">Safety needs</span>
                <input name="safety_needs" defaultValue={intakeProfile.safetyNeeds ?? ""} className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-command-muted">Budget expectation</span>
                <input name="budget_expectation" defaultValue={intakeProfile.budgetExpectation ?? ""} placeholder="Planning context only" className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-command-muted">Timeline</span>
                <input name="timeline" defaultValue={intakeProfile.timeline ?? ""} className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-command-muted">Key collection</span>
                <input name="key_collection_date" defaultValue={intakeProfile.keyCollectionDate ?? ""} className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-command-muted">Move-in date</span>
                <input name="move_in_date" defaultValue={intakeProfile.moveInDate ?? ""} className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-command-muted">Preferred meeting timing</span>
                <input name="preferred_meeting_timing" defaultValue={intakeProfile.preferredMeetingTiming ?? ""} className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text" />
              </label>
              <div className="flex items-end">
                <ActionButton type="submit">Save Intake Profile</ActionButton>
              </div>
            </form>
          </section>
          <section className="mt-5 rounded-lg border border-command-cyan/35 bg-command-elevated p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-cyan">Files / Meeting Prep Documents</p>
                <h2 className="mt-1 text-xl font-semibold text-command-text">Client file storage</h2>
                <p className="mt-2 max-w-3xl text-sm text-command-muted">
                  Floor plans, site photos, references, existing quotations, building rules, and other client documents are stored in the private client-files bucket.
                  View/download uses short-lived signed URLs only.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={hasFloorPlanFile ? "Floor Plan Received" : "Floor Plan Missing"} />
                <StatusBadge label={hasSitePhotosFile ? "Site Photos Received" : "Site Photos Missing"} />
                {activeUploadLinks.length ? <StatusBadge label="Upload Link Active" /> : <StatusBadge label="Upload Link Not Created Yet" />}
              </div>
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_18rem]">
              <div className="rounded-lg border border-command-line bg-command-bg/55 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-command-text">Received files</p>
                  <StatusBadge label={`${visibleLeadFiles.length} active file${visibleLeadFiles.length === 1 ? "" : "s"}`} />
                </div>
                {visibleLeadFiles.length ? (
                  <div className="mt-4 space-y-3">
                    {visibleLeadFiles.map((file) => {
                      const signedUrl = signedFileUrls.get(file.id) ?? "";
                      return (
                        <div key={file.id} className="rounded-lg border border-command-line bg-command-panel2 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-command-text">{file.originalFileName || "Client file"}</p>
                                <StatusBadge label={fileCategoryLabels[file.fileCategory] ?? humanizeLabel(file.fileCategory)} />
                                <StatusBadge label={humanizeLabel(file.fileStatus)} />
                              </div>
                              <p className="mt-2 text-sm text-command-muted">
                                Source: {humanizeLabel(file.source)} | Uploaded: {file.uploadedAt} | Size: {Math.round(file.fileSizeBytes / 1024)}KB
                              </p>
                              {file.notes ? <p className="mt-2 text-sm text-command-muted">Notes: {file.notes}</p> : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {signedUrl ? (
                                <a
                                  href={signedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-sm font-semibold text-command-muted hover:text-command-text"
                                >
                                  View / Download
                                </a>
                              ) : (
                                <span className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-sm text-command-muted">
                                  Signed URL unavailable
                                </span>
                              )}
                              <form action={markLeadFileReviewedAction}>
                                <input type="hidden" name="lead_id" value={lead.id} />
                                <input type="hidden" name="file_id" value={file.id} />
                                <ActionButton type="submit" tone="muted" disabled={file.fileStatus === "reviewed"}>Mark Reviewed</ActionButton>
                              </form>
                            </div>
                          </div>
                          <form action={voidLeadFileAction} className="mt-3 flex flex-wrap gap-2">
                            <input type="hidden" name="lead_id" value={lead.id} />
                            <input type="hidden" name="file_id" value={file.id} />
                            <input
                              name="void_reason"
                              placeholder="Void reason"
                              className="min-w-0 flex-1 rounded-md border border-command-line bg-command-bg px-3 py-2 text-sm text-command-text"
                            />
                            <ActionButton type="submit" tone="danger">Void File Record</ActionButton>
                          </form>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg border border-command-line bg-command-panel2 p-4 text-sm text-command-muted">
                    No files received yet. Floor plan missing. Site photos missing.
                  </p>
                )}
              </div>
              <aside className="rounded-lg border border-command-line bg-command-bg/55 p-4">
                <p className="font-semibold text-command-text">Secure upload link</p>
                <p className="mt-2 text-sm text-command-muted">
                  Create a token link for this lead. The raw token is shown only after creation; the database stores only a hash.
                </p>
                <form action={createLeadUploadLinkAction} className="mt-4">
                  <input type="hidden" name="lead_id" value={lead.id} />
                  <ActionButton type="submit">Create Upload Link</ActionButton>
                </form>
                {searchParams?.uploadLink ? (
                  <div className="mt-4 rounded-lg border border-command-gold/45 bg-command-gold/10 p-3 text-sm">
                    <p className="font-semibold text-command-gold">New upload link</p>
                    <p className="mt-2 break-all text-command-text">{`/upload/${searchParams.uploadLink}`}</p>
                  </div>
                ) : null}
                <div className="mt-4 space-y-2 text-sm text-command-muted">
                  <p>Active links: {activeUploadLinks.length}</p>
                  <p>Allowed categories:</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {LEAD_FILE_CATEGORIES.map((category) => (
                      <li key={category}>{fileCategoryLabels[category]}</li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          </section>
          <form action={updateLeadStatusAction} className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-command-line bg-command-elevated p-4">
            <input type="hidden" name="lead_id" value={lead.id} />
            <label className="grid gap-1 text-sm">
              <span className="text-command-muted">Update status</span>
              <select name="status" defaultValue={lead.status} className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-command-text">
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
          <div id="bot-controls" className="mt-5 rounded-lg border border-command-line bg-command-elevated p-5">
            <p className="text-lg font-semibold text-command-text">Human takeover and cleanup controls</p>
            <p className="mt-1 text-base text-command-muted">
              Normal delete is soft delete. Permanent delete is boss/admin only, requires prior soft delete, typed confirmation, reason, and an audit before deletion.
            </p>
            <div className="mt-4 rounded-lg border border-command-line bg-command-bg/60 p-4 text-sm">
              <p className="font-semibold text-command-text">Delete / Archive Controls</p>
              <p className="mt-2 text-command-muted">Your role: <span className="font-semibold text-command-text">{role}</span></p>
              <p className="mt-1 text-command-muted">Soft delete requires boss/admin permission.</p>
              <p className="mt-1 text-command-muted">Permanent delete requires boss/admin and prior soft delete.</p>
              {activeDeleteFeedback ? (
                <div className={`mt-3 rounded-md border p-3 ${activeDeleteFeedback.tone}`} data-testid="lead-delete-feedback">
                  <p className="font-semibold">{activeDeleteFeedback.title}</p>
                  <p className="mt-1">{activeDeleteFeedback.body}</p>
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={takeOverLeadAction}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <ActionButton type="submit" tone="muted">Take Over Lead</ActionButton>
              </form>
              <form action={pauseBotForLeadAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input name="reason" placeholder="Pause reason" className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-base text-command-text" />
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
                <input name="duplicate_of" placeholder="Duplicate of lead id" className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-base text-command-text" />
                <ActionButton type="submit" tone="muted">Mark Duplicate</ActionButton>
              </form>
              <form action={archiveLeadAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input name="reason" placeholder="Archive reason" className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-base text-command-text" disabled={!canSoftDelete} />
                <ActionButton type="submit" tone="muted" disabled={!canSoftDelete} data-testid="archive-lead-button">
                  {canSoftDelete ? "Archive Lead" : "Boss/admin only"}
                </ActionButton>
              </form>
              <form action={softDeleteLeadAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="lead_id" value={lead.id} />
                <input name="reason" placeholder="Soft delete reason" className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-base text-command-text" disabled={!canSoftDelete} />
                <ActionButton type="submit" tone="danger" disabled={!canSoftDelete} data-testid="soft-delete-lead-button">
                  {canSoftDelete ? "Soft Delete Lead" : "Boss/admin only"}
                </ActionButton>
              </form>
              <form action={restoreLeadAction}>
                <input type="hidden" name="lead_id" value={lead.id} />
                <ActionButton type="submit" tone="muted" disabled={!canRestore || !lead.deletedAt} data-testid="restore-lead-button">
                  Restore Lead
                </ActionButton>
              </form>
            </div>
            <form action={hardDeleteLeadAction} className="mt-5 grid gap-3 rounded-lg border border-command-red/60 bg-command-bg p-4 md:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="lead_id" value={lead.id} />
              <input name="reason" placeholder="Permanent delete reason" className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-base text-command-text" disabled={!hardDeleteEnabled} />
              <input name="confirmation" placeholder="Type PERMANENT DELETE" className="rounded-md border border-command-line bg-command-bg px-3 py-2 text-base text-command-text" disabled={!hardDeleteEnabled} />
              <ActionButton type="submit" tone="danger" disabled={!hardDeleteEnabled} data-testid="hard-delete-lead-button">Permanent Delete</ActionButton>
            </form>
          </div>
        </div>
        <aside className="rounded-lg border border-command-line bg-command-card p-5 shadow-premium">
          <h3 className="text-xl font-semibold">Readiness</h3>
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
      <section className="mission-panel mt-6 rounded-2xl p-5 md:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">Command Timeline</p>
            <h2 className="mt-1 text-2xl font-semibold text-command-text">Recent activity</h2>
          </div>
          <span className="w-fit rounded-full border border-command-line bg-command-bg/55 px-3 py-1 text-sm text-command-muted">
            Latest {commandTimeline.length || 0}
          </span>
        </div>
        <div className="mt-5 space-y-3">
          {commandTimeline.length ? commandTimeline.map((item) => (
            <div key={item.id} className="grid gap-3 rounded-2xl border border-command-line bg-command-bg/55 p-4 md:grid-cols-[10rem_1fr]">
              <p className="text-sm font-semibold text-command-muted">{item.at}</p>
              <div>
                <p className="font-semibold text-command-text">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-command-muted">{item.detail}</p>
              </div>
            </div>
          )) : (
            <div className="rounded-2xl border border-command-line bg-command-bg/55 p-4 text-command-muted">
              No recent activity yet. New WhatsApp messages, bot replies, and audit events will appear here once recorded.
            </div>
          )}
        </div>
      </section>
      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">WhatsApp Sales Brain</p>
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
        <aside className="rounded-lg border border-command-line bg-command-card p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.24em] text-command-gold">Calendar Foundation</p>
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
      <section className="mt-6 rounded-lg border border-command-line bg-command-card p-6 shadow-premium">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-command-gold">OpenAI Brain Dry-Run</p>
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
