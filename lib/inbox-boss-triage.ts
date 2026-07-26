import type { Lead, LeadMessage } from "@/lib/types";

export type BossTriageCategory =
  | "critical_client_issue"
  | "qualified_sales_lead"
  | "existing_client"
  | "media_review"
  | "operator_handling"
  | "vendor_or_business"
  | "job_or_subcontractor"
  | "spam_or_irrelevant"
  | "waiting_for_client"
  | "general_review";

export type BossTriageResult = {
  category: BossTriageCategory;
  priorityScore: number;
  reason: string;
  requiresReply: boolean;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function latestMeaningful(messages: LeadMessage[]) {
  return [...messages]
    .filter((message) => message.channel === "whatsapp" && message.body.trim())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

function combinedInbound(messages: LeadMessage[]) {
  return normalize(messages
    .filter((message) => message.direction === "inbound")
    .map((message) => `${message.body} ${message.metadata?.caption ?? ""} ${message.metadata?.filename ?? ""}`)
    .join(" "));
}

function hasMedia(messages: LeadMessage[]) {
  return messages.some((message) => message.direction === "inbound" && /image|document|video|pdf|floor plan|floorplan|drawing/.test(normalize(`${message.body} ${message.metadata?.messageType ?? ""} ${message.metadata?.mimeType ?? ""} ${message.metadata?.filename ?? ""}`)));
}

export function classifyBossTriage(lead: Lead, messages: LeadMessage[]): BossTriageResult {
  const latest = latestMeaningful(messages);
  const latestInbound = latest?.direction === "inbound";
  const text = combinedInbound(messages);
  const route = lead.conversationRoute ?? "sales_lead";
  const intent = lead.conversationIntent ?? "genuine_new_renovation_lead";

  if (lead.needsMarcus || lead.bossApprovalNeeded || /angry|frustrat|complaint|payment dispute|legal|safety|urgent/.test(text)) {
    return { category: "critical_client_issue", priorityScore: 100, reason: "Needs Marcus, complaint, safety, payment or urgent human judgment.", requiresReply: latestInbound };
  }

  if (lead.botPaused && !lead.needsMarcus) {
    return { category: "operator_handling", priorityScore: latestInbound ? 86 : 62, reason: "Bot is paused because an operator is handling the conversation.", requiresReply: latestInbound };
  }

  if (intent === "existing_client_project_message") {
    return { category: "existing_client", priorityScore: latestInbound ? 92 : 58, reason: "Existing client conversation should be reviewed ahead of ordinary enquiries.", requiresReply: latestInbound };
  }

  if (route === "sales_lead" && lead.leadEligible !== false) {
    const serious = Boolean(lead.propertyType || lead.scopeSummary || lead.projectAddress || lead.intakeProfile?.floorPlanStatus || lead.intakeProfile?.budgetExpectation || lead.intakeProfile?.timeline);
    return {
      category: "qualified_sales_lead",
      priorityScore: latestInbound ? (serious ? 90 : 78) : (serious ? 55 : 42),
      reason: serious ? "Qualified renovation lead with useful project evidence." : "Eligible renovation enquiry requiring qualification.",
      requiresReply: latestInbound
    };
  }

  if (hasMedia(messages) && latestInbound) {
    return { category: "media_review", priorityScore: 76, reason: "New client media or document requires operator review.", requiresReply: true };
  }

  if (/job|work permit|worker|looking for work|plaster|skim coat|subcon|subcontract|manpower|hacking job|support me/.test(text)) {
    return { category: "job_or_subcontractor", priorityScore: latestInbound ? 34 : 20, reason: "Job seeker or subcontractor request, not a homeowner sales lead.", requiresReply: false };
  }

  if (intent === "existing_vendor_or_business_contact" || /supplier|vendor|commission|rental|vending machine|marketing service|partnership|collaboration/.test(text)) {
    return { category: "vendor_or_business", priorityScore: latestInbound ? 30 : 18, reason: "Vendor or business proposal outside the renovation sales queue.", requiresReply: false };
  }

  if (intent === "spam_scam_irrelevant" || /loan|crypto|casino|betting|investment return/.test(text)) {
    return { category: "spam_or_irrelevant", priorityScore: 0, reason: "Spam or irrelevant conversation.", requiresReply: false };
  }

  if (!latestInbound) {
    return { category: "waiting_for_client", priorityScore: 16, reason: "LIMM sent the latest message and is waiting for the contact.", requiresReply: false };
  }

  return { category: "general_review", priorityScore: 48, reason: "Latest contact message requires classification or review.", requiresReply: true };
}
