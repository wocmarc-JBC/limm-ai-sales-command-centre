import type { FollowUp, Lead, LeadMessage } from "@/lib/types";

export type TestLeadCleanupAction =
  | "mark_test_and_soft_delete"
  | "hard_delete_test_data"
  | "already_soft_deleted_keep"
  | "protected_marcus_fio"
  | "not_touched";

export type TestLeadCleanupPlanItem = {
  lead: Lead;
  action: TestLeadCleanupAction;
  protectedPeople: string[];
  reasons: string[];
  weakReasons: string[];
  riskWarning: string;
  messageCount: number;
};

export type TestFollowUpCleanupAction =
  | "hide_or_complete_test_followup"
  | "already_hidden_keep"
  | "protected_marcus_fio"
  | "not_touched";

export type TestFollowUpCleanupPlanItem = {
  followUp: FollowUp;
  action: TestFollowUpCleanupAction;
  protectedPeople: string[];
  reasons: string[];
  weakReasons: string[];
  riskWarning: string;
};

function stringify(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

const knownTestPhrases = [
  "hello...can help me do my kitchen?",
  "do kitchen and demo 2 wall can?",
  "how much ah",
  "can make appt wed 2pm?",
  "can see your past works?",
  "got landed project photo?",
  "voice test",
  "floor plan test",
  "laminated wall cladding test",
  "test-only follow-up verification",
  "request scope, floor plan, and photos for initial project review"
];

const strongTestPattern = /\b(test|test_only|qa|demo|sample|sandbox|browser[_ -]?test|live[_ -]?test|auth[_ -]?boss[_ -]?browser[_ -]?test|playwright|dev[_ -]?brain|generated[_ -]?test|v3_3_live_test|v4_3_auth_boss_browser_test|v[3456][_ -])/i;

export function protectedPersonEvidence(lead: Lead, messages: LeadMessage[] = []) {
  const extendedLead = lead as Lead & Record<string, unknown>;
  const protectedText = [
    lead.clientName,
    extendedLead.displayName,
    extendedLead.display_name,
    extendedLead.contactName,
    extendedLead.contact_name,
    extendedLead.phoneLabel,
    extendedLead.phone_label,
    extendedLead.title,
    extendedLead.crmTitle,
    extendedLead.crm_title,
    lead.phone,
    lead.email,
    lead.lastClientMessage,
    lead.scopeSummary,
    stringify(extendedLead.metadata),
    ...messages.map((message) => `${message.body} ${stringify(message.metadata)}`)
  ].join("\n");
  const matches: string[] = [];
  if (/marcus/i.test(protectedText)) matches.push("Marcus");
  if (/fio/i.test(protectedText)) matches.push("Fio");
  if (/fion/i.test(protectedText)) matches.push("Fion");
  return [...new Set(matches)];
}

export function protectedFollowUpEvidence(followUp: FollowUp) {
  const protectedText = [
    followUp.id,
    followUp.clientName,
    followUp.followupType,
    followUp.templateType,
    followUp.status,
    followUp.suggestedMessage,
    followUp.notes,
    followUp.lead?.clientName,
    followUp.lead?.phone,
    followUp.lead?.email,
    followUp.lead?.lastClientMessage,
    followUp.lead?.scopeSummary,
    stringify((followUp as FollowUp & Record<string, unknown>).metadata),
    stringify((followUp.lead as (Lead & Record<string, unknown>) | null | undefined)?.metadata)
  ].join("\n");
  const matches: string[] = [];
  if (/marcus/i.test(protectedText)) matches.push("Marcus");
  if (/fio/i.test(protectedText)) matches.push("Fio");
  if (/fion/i.test(protectedText)) matches.push("Fion");
  return [...new Set(matches)];
}

function isFakePhone(phone: string) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return false;
  return /^(0+|1+|9{7,}|1234567|6599999999|6500000000)$/.test(digits)
    || /(000000|999999|1234567)$/.test(digits);
}

export function scoreTestLead(lead: Lead, messages: LeadMessage[] = []) {
  const reasons: string[] = [];
  const weakReasons: string[] = [];
  const protectedPeople = protectedPersonEvidence(lead, messages);
  const haystack = [
    lead.id,
    lead.clientName,
    lead.source,
    lead.lastClientMessage,
    lead.scopeSummary,
    lead.missionCategory,
    lead.leadLevel,
    ...messages.map((message) => `${message.body} ${stringify(message.metadata)} ${message.providerMessageId ?? ""}`)
  ].join("\n").toLowerCase();

  if (lead.isTest) reasons.push("already marked is_test");
  if (/\b(test|qa|sample|sandbox|test_only)\b/.test(lead.clientName.toLowerCase())) reasons.push("client name clearly marks test/QA/sample/sandbox");
  if (/\b(demo lead|demo client|demo qa|test demo|sample demo)\b/.test(lead.clientName.toLowerCase())) reasons.push("client name clearly marks demo test data");
  if (strongTestPattern.test(haystack) || /\b(test marker)\b/.test(haystack)) reasons.push("QA/test marker found in metadata or messages");
  if (/\b(v4_live_test|v4_1_dev_brain_test|v5_3|v6_ultimate|v6_1|test_marker)\b/.test(haystack)) reasons.push("versioned QA marker found");
  if (isFakePhone(lead.phone)) reasons.push("phone looks fake/test-only");
  if (/\b(seed_demo|script seed|generated qa|fixture)\b/.test(haystack)) reasons.push("created by seed/fixture/QA script");

  for (const phrase of knownTestPhrases) {
    if (haystack.includes(phrase)) weakReasons.push(`known QA phrase: ${phrase}`);
  }

  const clearlyTest = protectedPeople.length ? false : reasons.length > 0 || weakReasons.length >= 2;
  return {
    clearlyTest,
    protectedPeople,
    reasons,
    weakReasons,
    riskWarning: protectedPeople.length
      ? `Protected lead contains ${protectedPeople.join(" and ")}; excluded from cleanup completely.`
      : clearlyTest
        ? ""
        : "Not clearly test data; no cleanup action planned."
  };
}

export function isProtectedLead(lead: Lead, messages: LeadMessage[] = []) {
  return protectedPersonEvidence(lead, messages).length > 0;
}

export function isTestLead(lead: Lead, messages: LeadMessage[] = []) {
  return scoreTestLead(lead, messages).clearlyTest;
}

export function scoreTestFollowUp(followUp: FollowUp) {
  const reasons: string[] = [];
  const weakReasons: string[] = [];
  const protectedPeople = protectedFollowUpEvidence(followUp);
  const haystack = [
    followUp.id,
    followUp.leadId,
    followUp.clientName,
    followUp.followupType,
    followUp.templateType,
    followUp.status,
    followUp.suggestedMessage,
    followUp.notes,
    followUp.lead?.id,
    followUp.lead?.clientName,
    followUp.lead?.source,
    followUp.lead?.lastClientMessage,
    followUp.lead?.scopeSummary,
    followUp.lead?.missionCategory,
    followUp.lead?.leadLevel,
    stringify((followUp as FollowUp & Record<string, unknown>).metadata)
  ].join("\n").toLowerCase();

  if (followUp.lead?.isTest) reasons.push("parent lead already marked is_test");
  if (followUp.lead && scoreTestLead(followUp.lead).clearlyTest) reasons.push("follow-up belongs to a detected test lead");
  if (strongTestPattern.test(haystack)) reasons.push("follow-up contains QA/test/generated marker");
  if (/\b(test_only|test-only|browser test|live test|auth boss browser test)\b/i.test(haystack)) reasons.push("follow-up explicitly marks test-only data");
  for (const phrase of knownTestPhrases) {
    if (haystack.includes(phrase)) weakReasons.push(`known QA phrase: ${phrase}`);
  }

  const clearlyTest = protectedPeople.length ? false : reasons.length > 0 || weakReasons.length >= 1;
  return {
    clearlyTest,
    protectedPeople,
    reasons,
    weakReasons,
    riskWarning: protectedPeople.length
      ? `Protected follow-up contains ${protectedPeople.join(" and ")}; excluded from cleanup completely.`
      : clearlyTest
        ? ""
        : "Not clearly test follow-up data; no cleanup action planned."
  };
}

export function isProtectedFollowUp(followUp: FollowUp) {
  return protectedFollowUpEvidence(followUp).length > 0;
}

export function isTestFollowUp(followUp: FollowUp) {
  return scoreTestFollowUp(followUp).clearlyTest;
}

export function buildTestLeadCleanupPlan(
  leads: Lead[],
  messagesByLeadId: Map<string, LeadMessage[]> | Record<string, LeadMessage[]> = {},
  options: { hardDeleteTestData?: boolean } = {}
): TestLeadCleanupPlanItem[] {
  const getMessages = (leadId: string) => messagesByLeadId instanceof Map
    ? messagesByLeadId.get(leadId) ?? []
    : messagesByLeadId[leadId] ?? [];

  return leads.map((lead) => {
    const messages = getMessages(lead.id);
    const score = scoreTestLead(lead, messages);
    let action: TestLeadCleanupAction = "not_touched";
    if (score.protectedPeople.length) action = "protected_marcus_fio";
    else if (score.clearlyTest && options.hardDeleteTestData && lead.deletedAt) action = "hard_delete_test_data";
    else if (score.clearlyTest && lead.deletedAt) action = "already_soft_deleted_keep";
    else if (score.clearlyTest) action = "mark_test_and_soft_delete";

    return {
      lead,
      action,
      protectedPeople: score.protectedPeople,
      reasons: score.reasons,
      weakReasons: score.weakReasons,
      riskWarning: score.riskWarning,
      messageCount: messages.length
    };
  });
}

export function buildTestFollowUpCleanupPlan(followUps: FollowUp[]): TestFollowUpCleanupPlanItem[] {
  return followUps.map((followUp) => {
    const score = scoreTestFollowUp(followUp);
    let action: TestFollowUpCleanupAction = "not_touched";
    if (score.protectedPeople.length) action = "protected_marcus_fio";
    else if (score.clearlyTest && (followUp.status === "Completed" || followUp.completedAt)) action = "already_hidden_keep";
    else if (score.clearlyTest) action = "hide_or_complete_test_followup";

    return {
      followUp,
      action,
      protectedPeople: score.protectedPeople,
      reasons: score.reasons,
      weakReasons: score.weakReasons,
      riskWarning: score.riskWarning
    };
  });
}
