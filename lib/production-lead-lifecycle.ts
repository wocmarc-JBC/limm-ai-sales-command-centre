import type { Lead, LeadMessage } from "@/lib/types";

export type ProductionLeadLifecycleStatus =
  | "active"
  | "archived"
  | "closed"
  | "lost"
  | "spam"
  | "qa_test"
  | "soft_deleted";

export type ProductionLeadLifecycleResult = {
  status: ProductionLeadLifecycleStatus;
  reasons: string[];
};

function stringify(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function normalizedLeadText(lead: Lead, messages: LeadMessage[] = []) {
  const extended = lead as Lead & Record<string, unknown>;
  return [
    lead.id,
    lead.clientName,
    lead.phone,
    lead.source,
    lead.lastClientMessage,
    lead.scopeSummary,
    lead.conversationSummary,
    lead.missionCategory,
    lead.stageNotes,
    lead.leadLevel,
    extended.displayName,
    extended.display_name,
    extended.contactName,
    extended.contact_name,
    extended.title,
    extended.crmTitle,
    extended.crm_title,
    stringify(extended.metadata),
    ...messages.map((message) => `${message.body} ${stringify(message.metadata)} ${message.providerMessageId ?? ""}`)
  ].join("\n");
}

export function getQaTestLeadReasons(lead: Lead, messages: LeadMessage[] = []) {
  const reasons: string[] = [];
  const text = normalizedLeadText(lead, messages);
  const lower = text.toLowerCase();

  if (lead.isTest) reasons.push("lead explicitly marked is_test");
  if (/\btest\b|test_only|test-only/i.test(lead.phone)) reasons.push("phone contains explicit test marker");
  if (/test_only|test-only/i.test(lead.clientName)) reasons.push("name contains explicit TEST_ONLY marker");
  if (/test-only marker/i.test(text)) reasons.push("message contains Test-only marker");
  if (/browser qa scope/i.test(text)) reasons.push("scope contains browser QA scope");
  if (/browser qa|seed qa|generated qa|test generated|codex qa|codex browser qa|playwright|auth boss browser test/i.test(text)) {
    reasons.push("source or metadata contains QA seed marker");
  }
  if (/^\+?65[_ -]?test[_ -]?only$/i.test(lead.phone.trim())) reasons.push("phone equals +65_TEST_ONLY");
  if (/\bqa[_ -]?seed|seed[_ -]?qa|qa[_ -]?fixture|browser[_ -]?fixture\b/i.test(lower)) reasons.push("known QA seed fixture marker");

  return [...new Set(reasons)];
}

export function getProductionLeadLifecycle(lead: Lead, messages: LeadMessage[] = []): ProductionLeadLifecycleResult {
  if (lead.deletedAt) return { status: "soft_deleted", reasons: ["lead is soft-deleted"] };
  if (lead.archivedAt || lead.salesStage === "Archived") return { status: "archived", reasons: ["lead is archived"] };
  if (lead.isSpam) return { status: "spam", reasons: ["lead is marked spam"] };

  const qaReasons = getQaTestLeadReasons(lead, messages);
  if (qaReasons.length > 0) return { status: "qa_test", reasons: qaReasons };

  if (lead.salesStage === "Lost") return { status: "lost", reasons: ["lead is lost"] };
  return { status: "active", reasons: [] };
}

export function isActiveProductionLeadForDailyScreens(lead: Lead, messages: LeadMessage[] = []) {
  return getProductionLeadLifecycle(lead, messages).status === "active";
}
