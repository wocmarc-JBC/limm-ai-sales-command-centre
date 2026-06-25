import { getInboxQueueState, latestMeaningfulWhatsAppMessage } from "@/lib/inbox-queue";
import { buildLeadFacts, type LeadFacts } from "@/lib/lead-facts";
import { formatLeadDisplayName } from "@/lib/lead-display";
import { quotationStatusForLead } from "@/lib/sales-collection";
import type { FollowUp, Lead, LeadFile, LeadMessage } from "@/lib/types";

export type LeadSeriousnessLevel = "Cold" | "Curious" | "Serious" | "High Intent" | "Quote Ready";
export type FollowUpProtectionStatus =
  | "Needs Marcus reply"
  | "Waiting for client"
  | "Follow-up due"
  | "Overdue follow-up"
  | "High-intent idle"
  | "Failed send unresolved"
  | "Closed / not active";
export type QuotationGateStatus =
  | "Not Ready"
  | "Basic Info Missing"
  | "Files Needed"
  | "Location Needed"
  | "Boss Review Required"
  | "Site Review Needed"
  | "Ready for Quotation Review";

export type CommandCoreLeadSummary = {
  leadId: string;
  clientName: string;
  displayName: string;
  phone: string;
  latestWhatsappPreview: string;
  latestWhatsappAt: string;
  primaryStatus: string;
  nextAction: string;
  leadInfoCompleteness: number;
  seriousnessLevel: LeadSeriousnessLevel;
  seriousnessScore: number;
  seriousnessSignals: string[];
  missingInfo: string[];
  botStatus: "Bot active" | "Bot paused";
  humanTakeover: boolean;
  failedSend: boolean;
  quotationReadinessStatus: QuotationGateStatus;
  followUpStatus: FollowUpProtectionStatus;
};

export type FollowUpProtectionSummary = {
  id: string;
  leadId: string;
  followUpId?: string;
  clientName: string;
  phone: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  whoIsWaiting: "Marcus" | "Client" | "System";
  waitingDuration: string;
  waitingMinutes: number;
  dueAt: string;
  status: FollowUpProtectionStatus;
  urgency: "urgent" | "due" | "watch" | "normal" | "closed";
  leadSeriousness: LeadSeriousnessLevel;
  nextAction: string;
  suggestedFollowUpText: string;
  canMarkDone: boolean;
  canSnooze: boolean;
  disabledReason?: string;
};

export type QuotationReadinessSummary = {
  id: string;
  leadId: string;
  clientName: string;
  phone: string;
  propertyType: string;
  scopeSummary: string;
  locationStatus: string;
  floorPlanStatus: string;
  sitePhotosStatus: string;
  readinessStatus: QuotationGateStatus;
  readinessScore: number;
  missingItems: string[];
  nextAction: string;
  canMoveToQuotationReview: boolean;
  disabledReason: string;
};

const TWO_HOURS = 2 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const TWO_DAYS = 2 * ONE_DAY;
const THREE_DAYS = 3 * ONE_DAY;

function parseTime(value?: string | null) {
  const time = Date.parse(value ?? "");
  return Number.isNaN(time) ? 0 : time;
}

function preview(text: string) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "No WhatsApp message yet";
  return clean.length > 140 ? `${clean.slice(0, 137)}...` : clean;
}

function messageIsManual(message?: LeadMessage | null) {
  return Boolean(message?.metadata?.manualReply === true || message?.metadata?.manualTakeover === true);
}

function messageIsAi(message?: LeadMessage | null) {
  return Boolean(message && message.direction === "outbound" && !messageIsManual(message));
}

function failedSend(messages: LeadMessage[]) {
  return messages.some((message) => message.direction === "outbound" && message.whatsappStatus === "failed");
}

function latestByDirection(messages: LeadMessage[], direction: LeadMessage["direction"]) {
  return [...messages]
    .filter((message) => message.channel === "whatsapp" && message.direction === direction)
    .sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt))[0] ?? null;
}

function durationLabel(minutes: number) {
  if (minutes < 60) return `${Math.max(0, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function hasRiskyTechnicalScope(lead: Lead, facts: LeadFacts) {
  const text = [lead.lastClientMessage, facts.scopeSummary.value, lead.scopeSummary, lead.riskFlags.join(" ")].join(" ");
  return /a&a|addition|alteration|extension|hack|hacking|wall|structural|approval|submission|permit|roof|waterproof|drainage/i.test(text);
}

export function scoreLeadSeriousness(lead: Lead, messages: LeadMessage[], files: LeadFile[] = []) {
  const facts = buildLeadFacts(lead, messages, files);
  const signals: string[] = [];
  let score = 0;
  if (facts.floorPlanReceived.value) { score += 22; signals.push("floor plan received"); }
  if (facts.sitePhotosReceived.value) { score += 18; signals.push("site photos received"); }
  if (facts.addressRaw.value || facts.postalCode.value) { score += 18; signals.push("address/postal captured"); }
  if (facts.appointmentPreference.value || /appointment|site visit|meet|slot|available/i.test(lead.lastClientMessage)) { score += 15; signals.push("appointment intent"); }
  if (facts.budgetExpectation.value || /how much|budget|quote|quotation|price|cost/i.test(lead.lastClientMessage)) { score += 12; signals.push("budget/quotation question"); }
  if (/timeline|urgent|move in|handover|start|complete|cny|christmas/i.test([lead.lastClientMessage, facts.scopeSummary.value].join(" "))) { score += 8; signals.push("timeline mentioned"); }
  if (hasRiskyTechnicalScope(lead, facts)) { score += 10; signals.push("technical/approval risk"); }
  if (messages.filter((message) => message.direction === "inbound").length > 1) { score += 7; signals.push("followed up again"); }
  score = Math.min(100, score);
  const level: LeadSeriousnessLevel =
    facts.infoCompletenessScore >= 80 && score >= 60 ? "Quote Ready" :
      score >= 65 ? "High Intent" :
        score >= 40 ? "Serious" :
          score >= 15 ? "Curious" :
            "Cold";
  return { score, level, signals, facts };
}

export function buildQuotationReadinessGate(lead: Lead, messages: LeadMessage[] = [], files: LeadFile[] = []): QuotationReadinessSummary {
  const { facts } = scoreLeadSeriousness(lead, messages, files);
  const missing: string[] = [];
  if (!facts.propertyType.value) missing.push("property type");
  if (!facts.scopeSummary.value) missing.push("scope");
  if (facts.locationStatus === "missing_location") missing.push("location/address");
  if (!facts.floorPlanReceived.value && !facts.sitePhotosReceived.value) missing.push("floor plan or site photos");
  if (!facts.budgetExpectation.value) missing.push("client expectation");
  const risky = hasRiskyTechnicalScope(lead, facts);
  const needsSiteReview = /site visit|come down|meet|appointment/i.test([lead.lastClientMessage, facts.appointmentPreference.value].join(" "));
  let readinessStatus: QuotationGateStatus = "Not Ready";
  if (!facts.propertyType.value || !facts.scopeSummary.value) readinessStatus = "Basic Info Missing";
  else if (facts.locationStatus === "missing_location") readinessStatus = "Location Needed";
  else if (!facts.floorPlanReceived.value && !facts.sitePhotosReceived.value) readinessStatus = "Files Needed";
  else if (needsSiteReview && facts.infoCompletenessScore < 90) readinessStatus = "Site Review Needed";
  else if (risky) readinessStatus = "Boss Review Required";
  else readinessStatus = "Ready for Quotation Review";

  const canMoveToQuotationReview = readinessStatus === "Ready for Quotation Review";
  return {
    id: `phase3-qr-${lead.id}`,
    leadId: lead.id,
    clientName: formatLeadDisplayName(lead),
    phone: lead.phone,
    propertyType: facts.propertyType.value || "Not provided",
    scopeSummary: facts.scopeSummary.value || "Scope pending",
    locationStatus: facts.locationStatus,
    floorPlanStatus: facts.floorPlanReceived.value ? "Received" : "Not received",
    sitePhotosStatus: facts.sitePhotosReceived.value ? "Received" : "Not received",
    readinessStatus,
    readinessScore: facts.infoCompletenessScore,
    missingItems: missing,
    nextAction: canMoveToQuotationReview
      ? "Marcus can review this lead for quotation readiness. No price is generated."
      : facts.nextAction,
    canMoveToQuotationReview,
    disabledReason: canMoveToQuotationReview ? "" : `Not ready: ${readinessStatus}. Missing ${missing.join(", ") || "Marcus review"}.`
  };
}

export function buildFollowUpProtectionSummary(
  lead: Lead,
  messages: LeadMessage[] = [],
  files: LeadFile[] = [],
  existingFollowUp?: FollowUp
): FollowUpProtectionSummary {
  if (lead.deletedAt || lead.archivedAt || lead.isSpam || lead.isTest || lead.status === "Not Suitable") {
    return {
      id: `closed-${lead.id}`,
      leadId: lead.id,
      clientName: formatLeadDisplayName(lead),
      phone: lead.phone,
      lastMessagePreview: "Closed / not active",
      lastMessageAt: lead.updatedAt ?? lead.createdAt,
      whoIsWaiting: "System",
      waitingDuration: "0m",
      waitingMinutes: 0,
      dueAt: lead.updatedAt ?? lead.createdAt,
      status: "Closed / not active",
      urgency: "closed",
      leadSeriousness: "Cold",
      nextAction: "No active follow-up needed.",
      suggestedFollowUpText: "",
      canMarkDone: false,
      canSnooze: false,
      disabledReason: "Lead is archived, closed, spam, or not active."
    };
  }
  const latest = latestMeaningfulWhatsAppMessage(messages);
  const inbound = latestByDirection(messages, "inbound");
  const outbound = latestByDirection(messages, "outbound");
  const manual = outbound && messageIsManual(outbound) ? outbound : null;
  const ai = outbound && messageIsAi(outbound) ? outbound : null;
  const latestAt = latest?.createdAt || lead.updatedAt || lead.createdAt;
  const now = Date.now();
  const waitingMs = Math.max(0, now - parseTime(latestAt));
  const waitingMinutes = Math.floor(waitingMs / 60000);
  const seriousness = scoreLeadSeriousness(lead, messages, files);
  const failed = failedSend(messages);
  let status: FollowUpProtectionStatus = "Waiting for client";
  let urgency: FollowUpProtectionSummary["urgency"] = "normal";
  let whoIsWaiting: FollowUpProtectionSummary["whoIsWaiting"] = "Client";
  let nextAction = "Wait for client response.";

  if (failed) {
    status = "Failed send unresolved";
    urgency = "urgent";
    whoIsWaiting = "Marcus";
    nextAction = "Review failed WhatsApp send and reply manually from Inbox.";
  } else if (latest?.direction === "inbound") {
    status = "Needs Marcus reply";
    urgency = waitingMs >= TWO_HOURS ? "urgent" : "due";
    whoIsWaiting = "Marcus";
    nextAction = "Reply from WhatsApp Inbox.";
  } else if (manual) {
    status = waitingMs >= THREE_DAYS ? "Overdue follow-up" : waitingMs >= TWO_DAYS ? "Follow-up due" : "Waiting for client";
    urgency = waitingMs >= THREE_DAYS ? "urgent" : waitingMs >= TWO_DAYS ? "due" : "normal";
    whoIsWaiting = "Client";
    nextAction = status === "Waiting for client" ? "Wait for client response." : "Send a gentle manual follow-up if appropriate.";
  } else if (ai) {
    status = seriousness.level === "High Intent" || seriousness.level === "Quote Ready" || waitingMs >= ONE_DAY ? "High-intent idle" : "Waiting for client";
    urgency = status === "High-intent idle" ? "due" : "watch";
    whoIsWaiting = status === "High-intent idle" ? "Marcus" : "Client";
    nextAction = status === "High-intent idle" ? "Marcus should review this high-intent lead." : "Bot replied; monitor for client response.";
  } else if (existingFollowUp?.status === "Overdue") {
    status = "Overdue follow-up";
    urgency = "urgent";
    whoIsWaiting = "Marcus";
    nextAction = "Follow-up is overdue.";
  }

  return {
    id: existingFollowUp?.id ?? `phase3-followup-${lead.id}`,
    leadId: lead.id,
    followUpId: existingFollowUp?.id,
    clientName: formatLeadDisplayName(lead),
    phone: lead.phone,
    lastMessagePreview: preview(latest?.body || lead.lastClientMessage || lead.scopeSummary),
    lastMessageAt: latestAt,
    whoIsWaiting,
    waitingDuration: durationLabel(waitingMinutes),
    waitingMinutes,
    dueAt: status === "Waiting for client" ? new Date(parseTime(latestAt) + TWO_DAYS).toISOString() : new Date().toISOString(),
    status,
    urgency,
    leadSeriousness: seriousness.level,
    nextAction,
    suggestedFollowUpText: "Hi, just checking in. If you have any floor plan, site photos, or preferred timing, you can send them here and Marcus can review the next step.",
    canMarkDone: true,
    canSnooze: status !== "Failed send unresolved",
    disabledReason: status === "Failed send unresolved" ? "Resolve the failed WhatsApp send before snoozing." : undefined
  };
}

export function buildCommandCoreLeadSummary(lead: Lead, messages: LeadMessage[] = [], files: LeadFile[] = []): CommandCoreLeadSummary {
  const latest = latestMeaningfulWhatsAppMessage(messages);
  const queue = getInboxQueueState(lead, messages);
  const seriousness = scoreLeadSeriousness(lead, messages, files);
  const quotation = buildQuotationReadinessGate(lead, messages, files);
  const followUp = buildFollowUpProtectionSummary(lead, messages, files);
  return {
    leadId: lead.id,
    clientName: lead.clientName,
    displayName: formatLeadDisplayName(lead),
    phone: lead.phone,
    latestWhatsappPreview: preview(latest?.body || lead.lastClientMessage || ""),
    latestWhatsappAt: latest?.createdAt || lead.updatedAt || lead.createdAt,
    primaryStatus: queue.primaryStatus,
    nextAction: seriousness.facts.nextAction,
    leadInfoCompleteness: seriousness.facts.infoCompletenessScore,
    seriousnessLevel: seriousness.level,
    seriousnessScore: seriousness.score,
    seriousnessSignals: seriousness.signals,
    missingInfo: seriousness.facts.missingFields,
    botStatus: lead.botPaused ? "Bot paused" : "Bot active",
    humanTakeover: Boolean(lead.botPaused),
    failedSend: failedSend(messages),
    quotationReadinessStatus: quotation.readinessStatus,
    followUpStatus: followUp.status
  };
}

export function groupQuotationSummaries(items: QuotationReadinessSummary[]) {
  const groups: Record<QuotationGateStatus, QuotationReadinessSummary[]> = {
    "Ready for Quotation Review": [],
    "Boss Review Required": [],
    "Files Needed": [],
    "Location Needed": [],
    "Site Review Needed": [],
    "Basic Info Missing": [],
    "Not Ready": []
  };
  for (const item of items) groups[item.readinessStatus].push(item);
  return groups;
}

export function phase3SummarySort(a: CommandCoreLeadSummary, b: CommandCoreLeadSummary) {
  const rank = (item: CommandCoreLeadSummary) =>
    item.failedSend ? 0 :
      item.followUpStatus === "Needs Marcus reply" ? 1 :
        item.followUpStatus === "Overdue follow-up" ? 2 :
          item.followUpStatus === "Follow-up due" ? 3 :
            item.quotationReadinessStatus === "Ready for Quotation Review" ? 4 :
              5;
  const priority = rank(a) - rank(b);
  if (priority !== 0) return priority;
  return parseTime(b.latestWhatsappAt) - parseTime(a.latestWhatsappAt);
}

export function quotationManualStatusLabel(lead: Lead) {
  return quotationStatusForLead(lead);
}
