import type { Lead } from "@/lib/types";

export type InboxLane = "sales" | "non-sales" | "jobs" | "vendors" | "spam";

const NON_SALES_INTENTS = new Set<NonNullable<Lead["conversationIntent"]>>([
  "vendor_supplier_solicitation",
  "partnership_collaboration_outreach",
  "recruitment_job_enquiry",
  "spam_scam_irrelevant",
  "wrong_number_or_general_chat",
  "existing_vendor_or_business_contact"
]);

const NON_SALES_ROUTES = new Set<NonNullable<Lead["conversationRoute"]>>([
  "vendor_inbox",
  "partnership_review",
  "recruitment_review",
  "spam_suppressed",
  "general_enquiry",
  "business_contact"
]);

export function inboxLaneFromParam(value?: string | null): InboxLane {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["non-sales", "nonsales", "non_sales"].includes(normalized)) return "non-sales";
  if (["jobs", "job", "recruitment"].includes(normalized)) return "jobs";
  if (["vendors", "vendor", "partners", "partnerships"].includes(normalized)) return "vendors";
  if (["spam", "irrelevant"].includes(normalized)) return "spam";
  return "sales";
}

export function nonSalesInboxCategory(lead: Lead) {
  const intent = lead.conversationIntent;
  if (intent === "recruitment_job_enquiry") return "jobs" as const;
  if (["vendor_supplier_solicitation", "partnership_collaboration_outreach", "existing_vendor_or_business_contact"].includes(String(intent))) {
    return "vendors" as const;
  }
  if (["spam_scam_irrelevant", "wrong_number_or_general_chat"].includes(String(intent))) return "spam" as const;

  const route = lead.conversationRoute;
  if (route === "recruitment_review") return "jobs" as const;
  if (["vendor_inbox", "partnership_review", "business_contact"].includes(String(route))) return "vendors" as const;
  if (["spam_suppressed", "general_enquiry"].includes(String(route))) return "spam" as const;
  return null;
}

export function isNonSalesInboxConversation(lead: Lead) {
  return Boolean(
    (lead.conversationIntent && NON_SALES_INTENTS.has(lead.conversationIntent)) ||
    (lead.conversationRoute && NON_SALES_ROUTES.has(lead.conversationRoute))
  );
}

export function leadMatchesInboxLane(lead: Lead, lane: InboxLane) {
  const category = nonSalesInboxCategory(lead);
  if (lane === "sales") return !isNonSalesInboxConversation(lead);
  if (lane === "non-sales") return isNonSalesInboxConversation(lead);
  return category === lane;
}

export function inboxLaneLabel(lane: InboxLane) {
  if (lane === "jobs") return "Job Enquiries";
  if (lane === "vendors") return "Vendors & Partners";
  if (lane === "spam") return "Spam & Irrelevant";
  if (lane === "non-sales") return "Non-Sales Inbox";
  return "WhatsApp Sales Inbox";
}
