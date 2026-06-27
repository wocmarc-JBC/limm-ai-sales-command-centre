import { addSingaporeDays, daysBetweenSingaporeDates, isDueOnOrBeforeSingaporeDate, overdueDaysSingapore, safeSingaporeDateLabel, singaporeDateKey } from "@/lib/date-safety";
import { activePayments, amountCollected, money, quotationStatusForLead, salesStageForLead } from "@/lib/sales-collection";
import { getLeadRiskBadges, HIGH_VALUE_JOB_THRESHOLD } from "@/lib/risk-badges";
import type { ApprovalRequest, AuditLog, FollowUp, Lead, PaymentRecord, ProjectAccount, QuotationPackage } from "@/lib/types";

export type BossReviewActionKey =
  | "approve_quote"
  | "reject_quote"
  | "need_site_visit_first"
  | "ask_for_more_info"
  | "escalate_to_manager"
  | "pause_bot"
  | "human_takeover";

export const bossReviewActions: Array<{
  key: BossReviewActionKey;
  label: string;
  auditAction: string;
  summary: string;
}> = [
  { key: "approve_quote", label: "Approve quote", auditAction: "boss_quote_approved", summary: "Boss approved this lead for manual quotation sending." },
  { key: "reject_quote", label: "Reject quote", auditAction: "boss_quote_rejected", summary: "Boss rejected the current quotation pack." },
  { key: "need_site_visit_first", label: "Need site visit first", auditAction: "boss_quote_site_visit_required", summary: "Boss requires a site visit before quotation." },
  { key: "ask_for_more_info", label: "Ask for more info", auditAction: "boss_quote_more_info_requested", summary: "Boss requested more information before quotation." },
  { key: "escalate_to_manager", label: "Escalate to manager", auditAction: "boss_quote_escalated_to_manager", summary: "Boss escalated this lead to manager review." },
  { key: "pause_bot", label: "Pause bot", auditAction: "boss_action_pause_bot", summary: "Boss paused the bot for this lead." },
  { key: "human_takeover", label: "Human takeover", auditAction: "boss_action_human_takeover", summary: "Boss requested human takeover for this lead." }
];

export type JobStartChecklistKey =
  | "boss_start_approved"
  | "scope_confirmed"
  | "drawings_confirmed"
  | "materials_confirmed"
  | "workers_assigned"
  | "site_access_confirmed"
  | "mcst_approval_confirmed"
  | "protection_arranged";

export const jobStartChecklistActions: Array<{
  key: JobStartChecklistKey;
  label: string;
  auditAction: string;
}> = [
  { key: "boss_start_approved", label: "Boss-approved start", auditAction: "boss_start_approved" },
  { key: "scope_confirmed", label: "Scope confirmed", auditAction: "job_start_scope_confirmed" },
  { key: "drawings_confirmed", label: "Drawings confirmed", auditAction: "job_start_drawings_confirmed" },
  { key: "materials_confirmed", label: "Materials confirmed", auditAction: "job_start_materials_confirmed" },
  { key: "workers_assigned", label: "Workers assigned", auditAction: "job_start_workers_assigned" },
  { key: "site_access_confirmed", label: "Site access confirmed", auditAction: "job_start_site_access_confirmed" },
  { key: "mcst_approval_confirmed", label: "Condo/MCST approval confirmed", auditAction: "job_start_mcst_approval_confirmed" },
  { key: "protection_arranged", label: "Protection arranged", auditAction: "job_start_protection_arranged" }
];

export function bossReviewActionForKey(key: string) {
  return bossReviewActions.find((action) => action.key === key);
}

export function jobStartChecklistActionForKey(key: string) {
  return jobStartChecklistActions.find((action) => action.key === key);
}

function auditHasAction(auditLogs: AuditLog[], actions: string[]) {
  return auditLogs.some((entry) => actions.includes(entry.action));
}

function maxLeadValue(lead: Lead) {
  return Math.max(lead.potentialValue ?? 0, lead.quotedAmount ?? 0, lead.confirmedValue ?? 0);
}

export function buildQuoteApprovalGate(lead: Lead, auditLogs: AuditLog[] = []) {
  const badges = getLeadRiskBadges(lead);
  const highValue = maxLeadValue(lead) >= HIGH_VALUE_JOB_THRESHOLD;
  const highRisk = badges.some((badge) => badge.severity === "high" || badge.severity === "critical");
  const approved = auditHasAction(auditLogs, ["boss_quote_approved", "boss_action_approve_quote"]);
  const rejected = auditHasAction(auditLogs, ["boss_quote_rejected"]);
  const requiresApproval = Boolean(lead.bossApprovalNeeded || highRisk || highValue);
  const reasons = [
    lead.bossApprovalNeeded ? "lead already marked for boss approval" : "",
    highRisk ? `risk badges: ${badges.map((badge) => badge.label).join(", ")}` : "",
    highValue ? `job value is ${money(maxLeadValue(lead))} or above threshold ${money(HIGH_VALUE_JOB_THRESHOLD)}` : ""
  ].filter(Boolean);

  return {
    requiresApproval,
    approved,
    rejected,
    canMoveToQuoted: !requiresApproval || approved,
    reasons,
    badges,
    blockedReason: requiresApproval && !approved
      ? `Boss approval required before Quotation Sent/Quoted: ${reasons.join("; ") || "high-risk lead"}.`
      : ""
  };
}

export function isQuoteSentPatch(patch: Partial<Lead>) {
  return patch.salesStage === "Quotation Sent" || patch.quotationStatus === "Sent" || Boolean(patch.quoteSentDate);
}

function paymentReceived(payment: PaymentRecord) {
  return Boolean(payment.receivedDate || /received|fully paid/i.test(payment.status));
}

export function depositReceivedForProject(project: ProjectAccount, payments: PaymentRecord[]) {
  return activePayments(payments)
    .filter((payment) => payment.projectId === project.id)
    .some((payment) => payment.paymentType === "deposit" && paymentReceived(payment));
}

function isCondoMcstJob(project: ProjectAccount, lead?: Lead | null) {
  const text = [project.propertyType, project.notes, lead?.propertyType, lead?.riskFlags.join(" "), lead?.lastClientMessage].filter(Boolean).join(" ");
  return /condo|mcst|management|building rules|renovation permit/i.test(text);
}

export function buildDoNotStartGate(project: ProjectAccount, lead: Lead | null | undefined, payments: PaymentRecord[], auditLogs: AuditLog[] = []) {
  const needsMcst = isCondoMcstJob(project, lead);
  const checks = [
    { key: "deposit_received", label: "Deposit not received", met: depositReceivedForProject(project, payments) },
    { key: "boss_start_approved", label: "Boss-approved start missing", met: auditHasAction(auditLogs, ["boss_start_approved"]) },
    { key: "scope_confirmed", label: "Scope not confirmed", met: auditHasAction(auditLogs, ["job_start_scope_confirmed"]) },
    { key: "drawings_confirmed", label: "Drawings not confirmed", met: auditHasAction(auditLogs, ["job_start_drawings_confirmed"]) },
    { key: "materials_confirmed", label: "Materials not confirmed", met: auditHasAction(auditLogs, ["job_start_materials_confirmed"]) },
    { key: "workers_assigned", label: "Workers not assigned", met: auditHasAction(auditLogs, ["job_start_workers_assigned"]) },
    { key: "site_access_confirmed", label: "Site access not confirmed", met: auditHasAction(auditLogs, ["job_start_site_access_confirmed"]) },
    { key: "mcst_approval_confirmed", label: "Condo/MCST approval missing", met: !needsMcst || auditHasAction(auditLogs, ["job_start_mcst_approval_confirmed"]) },
    { key: "protection_arranged", label: "Protection not arranged", met: auditHasAction(auditLogs, ["job_start_protection_arranged"]) }
  ];
  const missingItems = checks.filter((check) => !check.met).map((check) => check.label);
  return {
    canStart: missingItems.length === 0,
    statusLabel: missingItems.length === 0 ? "Can Start" : "Cannot Start",
    missingItems,
    checks,
    needsMcst
  };
}

export type PaymentMilestone = {
  label: string;
  percent: number;
  amount: number;
};

export function buildJbcDefaultPaymentSchedule(confirmedValue: number): PaymentMilestone[] {
  const value = Math.max(0, confirmedValue || 0);
  return [
    { label: "Deposit 50%", percent: 50, amount: Math.round(value * 0.5) },
    { label: "Progress 40%", percent: 40, amount: Math.round(value * 0.4) },
    { label: "Final 10%", percent: 10, amount: Math.max(0, value - Math.round(value * 0.5) - Math.round(value * 0.4)) }
  ];
}

function milestoneLabel(payment: PaymentRecord) {
  if (payment.paymentType === "deposit") return "Deposit";
  if (payment.paymentType === "progress") return "Progress";
  if (payment.paymentType === "final") return "Final";
  return payment.notes || "Custom milestone";
}

export type CollectionQueueItem = {
  id: string;
  projectId: string;
  leadId: string;
  clientName: string;
  amountDue: number;
  dueDate: string | null;
  dueDateLabel: string;
  overdueDays: number;
  jobClient: string;
  paymentMilestone: string;
  chaseStatus: string;
  nextChaseDate: string;
  stopWorkWarning: string;
  scheduleSource: "JBC default 50/40/10" | "LIMM Works custom milestone";
};

export function buildCollectionQueue(projects: ProjectAccount[], payments: PaymentRecord[], today: string | Date = new Date()): CollectionQueueItem[] {
  const rows: CollectionQueueItem[] = [];

  for (const project of projects) {
    const projectPayments = activePayments(payments).filter((payment) => payment.projectId === project.id);
    if (!projectPayments.length && project.confirmedValue > 0) {
      const deposit = buildJbcDefaultPaymentSchedule(project.confirmedValue)[0];
      rows.push({
        id: `default-deposit-${project.id}`,
        projectId: project.id,
        leadId: project.leadId,
        clientName: project.clientName,
        amountDue: deposit.amount,
        dueDate: null,
        dueDateLabel: "Set due date",
        overdueDays: 0,
        jobClient: `${project.clientName} / ${project.scopeSummary || project.propertyType}`,
        paymentMilestone: deposit.label,
        chaseStatus: "Deposit not received",
        nextChaseDate: singaporeDateKey(today),
        stopWorkWarning: "Do not start work until deposit is received.",
        scheduleSource: "JBC default 50/40/10"
      });
      continue;
    }

    for (const payment of projectPayments) {
      if (paymentReceived(payment) || payment.status === "Disputed") continue;
      const overdueDays = overdueDaysSingapore(payment.dueDate, today);
      const diff = daysBetweenSingaporeDates(payment.dueDate, today);
      const dueSoon = diff !== null && diff >= 0 && diff <= 2;
      rows.push({
        id: payment.id,
        projectId: project.id,
        leadId: project.leadId,
        clientName: project.clientName,
        amountDue: payment.amount,
        dueDate: payment.dueDate,
        dueDateLabel: safeSingaporeDateLabel(payment.dueDate, "Set due date"),
        overdueDays,
        jobClient: `${project.clientName} / ${project.scopeSummary || project.propertyType}`,
        paymentMilestone: milestoneLabel(payment),
        chaseStatus: overdueDays > 0 ? "Overdue - chase today" : dueSoon ? "Due soon - remind client" : "Scheduled",
        nextChaseDate: overdueDays > 0 || isDueOnOrBeforeSingaporeDate(payment.dueDate, today)
          ? singaporeDateKey(today)
          : payment.dueDate ? singaporeDateKey(payment.dueDate) : singaporeDateKey(today),
        stopWorkWarning: payment.paymentType === "deposit" && !paymentReceived(payment)
          ? "Stop-work warning: deposit must clear before start."
          : overdueDays >= 7 ? "Stop-work warning: escalate before continuing work." : "",
        scheduleSource: projectPayments.length ? "LIMM Works custom milestone" : "JBC default 50/40/10"
      });
    }
  }

  return rows.sort((a, b) => {
    if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays;
    const aDiff = daysBetweenSingaporeDates(a.dueDate, today) ?? 999;
    const bDiff = daysBetweenSingaporeDates(b.dueDate, today) ?? 999;
    return aDiff - bDiff;
  });
}

export type BossBriefItem = {
  key: string;
  title: string;
  count: number;
  href: string;
  tone: "red" | "amber" | "gold" | "cyan" | "green" | "slate";
  detail: string;
  examples: string[];
};

export function buildBossDailyBrief({
  leads,
  followUps,
  approvalRequests,
  quotationPackages = [],
  projects,
  payments,
  auditLogs
}: {
  leads: Lead[];
  followUps: FollowUp[];
  approvalRequests: ApprovalRequest[];
  quotationPackages?: QuotationPackage[];
  projects: ProjectAccount[];
  payments: PaymentRecord[];
  auditLogs: AuditLog[];
}): BossBriefItem[] {
  const logsByLead = new Map<string, AuditLog[]>();
  for (const log of auditLogs) {
    if (log.entityType !== "lead") continue;
    const current = logsByLead.get(log.entityId) ?? [];
    current.push(log);
    logsByLead.set(log.entityId, current);
  }
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const projectStartGates = projects.map((project) => buildDoNotStartGate(project, leadById.get(project.leadId), payments, logsByLead.get(project.leadId) ?? []));
  const collectionQueue = buildCollectionQueue(projects, payments);
  const pendingApprovals = approvalRequests.filter((request) => request.status === "pending");
  const pendingQuotationPackages = quotationPackages.filter((quotation) => quotation.status === "Submitted for Boss Review");
  const humanReply = leads.filter((lead) => lead.needsMarcus || lead.botPaused || lead.lastReplyAt === null);
  const angry = leads.filter((lead) => /angry|upset|confused|don't understand|dont understand|why|complaint|refund|lawyer|wtf|unhappy/i.test(lead.lastClientMessage));
  const hotNotFollowed = leads.filter((lead) => (lead.leadCategory === "Hot" || lead.leadScore >= 70) && !lead.followedUpAt && salesStageForLead(lead) !== "Won");
  const overdueFollowUps = followUps.filter((followUp) => followUp.status === "Overdue" || isDueOnOrBeforeSingaporeDate(followUp.dueAt));
  const quoteGated = leads.filter((lead) => buildQuoteApprovalGate(lead, logsByLead.get(lead.id) ?? []).requiresApproval && quotationStatusForLead(lead) !== "Sent");
  const highRisk = leads.filter((lead) => getLeadRiskBadges(lead).some((badge) => badge.severity !== "watch"));
  const jobsBlocked = projectStartGates.filter((gate) => !gate.canStart);
  const depositsUnpaid = collectionQueue.filter((item) => /deposit/i.test(item.paymentMilestone));
  const overdueCollections = collectionQueue.filter((item) => item.overdueDays > 0);
  const todaysAppointments = leads.filter((lead) => lead.status === "Appointment Pending" || lead.status === "Ready To Book" || /today|appointment|site visit|meet|slot/i.test(lead.lastClientMessage));
  const botPaused = leads.filter((lead) => lead.botPaused || lead.needsMarcus);

  const item = (key: string, title: string, rows: Array<Lead | FollowUp | ProjectAccount | CollectionQueueItem | ApprovalRequest | QuotationPackage>, href: string, tone: BossBriefItem["tone"], detail: string, examples: string[]): BossBriefItem => ({
    key,
    title,
    count: rows.length,
    href,
    tone,
    detail,
    examples: examples.slice(0, 3)
  });

  return [
    item("human_reply_needed", "Human reply needed", humanReply, "/inbox", "red", "Client is waiting, bot is paused, or Marcus review is required.", humanReply.map((lead) => lead.clientName)),
    item("angry_confused_clients", "Angry/confused clients", angry, "/inbox", "red", "Complaint, confusion, refund, legal, or upset-language detected.", angry.map((lead) => lead.clientName)),
    item("hot_leads_not_followed", "Hot leads not followed up", hotNotFollowed, "/sales-pipeline", "gold", "High-score or hot leads without a recorded manual follow-up.", hotNotFollowed.map((lead) => lead.clientName)),
    item("followups_overdue", "Follow-ups overdue", overdueFollowUps, "/followups", "amber", "Follow-up due date is today or already overdue in Singapore time.", overdueFollowUps.map((followUp) => followUp.clientName)),
    item("quotations_awaiting_boss", "Quotations awaiting boss approval", [...pendingApprovals, ...pendingQuotationPackages, ...quoteGated], "/approvals", "gold", "High-risk/high-value quote gate is waiting for boss decision.", [...pendingQuotationPackages.map((quotation) => `${quotation.clientName} v${quotation.versionNumber}`), ...pendingApprovals.map((approval) => approval.title), ...quoteGated.map((lead) => lead.clientName)]),
    item("high_risk_leads", "High-risk leads", highRisk, "/sales-pipeline", "red", "Risk badges include landed, A&A, structural, hacking, MCST, timeline, or margin flags.", highRisk.map((lead) => lead.clientName)),
    item("jobs_blocked_from_starting", "Jobs blocked from starting", jobsBlocked as unknown as ProjectAccount[], "/delivery", "red", "Won jobs are missing start-gate requirements.", projects.filter((_, index) => !projectStartGates[index].canStart).map((project) => project.clientName)),
    item("deposits_unpaid", "Deposits unpaid", depositsUnpaid, "/sales-collection", "amber", "Deposit collection is missing or not received.", depositsUnpaid.map((row) => row.clientName)),
    item("overdue_collections", "Overdue collections", overdueCollections, "/sales-collection", "red", "Collection due date is before today in Singapore time.", overdueCollections.map((row) => `${row.clientName} ${row.overdueDays}d`)),
    item("todays_appointments", "Today's appointments", todaysAppointments, "/appointments", "cyan", "Appointment requests and same-day site discussion pressure.", todaysAppointments.map((lead) => lead.clientName)),
    item("bot_paused_takeover", "Bot paused / human takeover cases", botPaused, "/inbox", "cyan", "Bot paused, human takeover, or Marcus flag is active.", botPaused.map((lead) => lead.clientName))
  ];
}

export function suggestedQuoteFollowUpDate(today: string | Date = new Date()) {
  return `${addSingaporeDays(today, 2)}T09:00:00+08:00`;
}
