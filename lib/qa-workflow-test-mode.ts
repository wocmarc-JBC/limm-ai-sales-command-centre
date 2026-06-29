import { isProductionHiddenLead } from "@/lib/production-visibility";
import type { Lead, QuotationPackage } from "@/lib/types";

type QaWorkflowRole = "boss" | "admin" | "sales" | "viewer" | string | undefined;

function includesQa(value = "") {
  return /qa/i.test(value);
}

function startsWithQaPrefix(value = "") {
  return /^QA_/i.test(value.trim());
}

export function isClearlyQaWorkflowLead(lead: Lead | null | undefined) {
  if (!lead) return false;
  const clientHasQa = includesQa(lead.clientName);
  const sourceHasQa = includesQa(lead.source) || includesQa(lead.leadSource);
  const markedTest = Boolean(lead.isTest || /spam\/test/i.test(lead.leadLevel ?? "") || /test\/spam cleanup/i.test(lead.missionCategory ?? ""));
  const qaIdentity = markedTest || startsWithQaPrefix(lead.clientName);
  const qaSourceOrName = sourceHasQa || clientHasQa;
  const notRealClient = isProductionHiddenLead(lead) && (markedTest || startsWithQaPrefix(lead.clientName) || sourceHasQa);
  return qaIdentity && qaSourceOrName && notRealClient;
}

export function getQaWorkflowTestEligibility(input: {
  role?: QaWorkflowRole;
  lead: Lead | null | undefined;
  quotation: QuotationPackage | null | undefined;
}) {
  const reasons: string[] = [];
  const roleAllowed = input.role === "boss" || input.role === "admin";
  if (!roleAllowed) reasons.push("QA workflow controls require boss/admin role.");
  if (!input.lead) reasons.push("Lead is missing.");
  if (!input.quotation) reasons.push("Quotation package is missing.");
  if (input.lead && input.quotation && input.quotation.leadId !== input.lead.id) {
    reasons.push("Quotation does not belong to this lead.");
  }
  if (input.lead && !isClearlyQaWorkflowLead(input.lead)) {
    reasons.push("Lead is not a clearly marked QA/test lead.");
  }
  if (input.lead && input.quotation && input.quotation.clientName && input.quotation.clientName !== input.lead.clientName) {
    const quoteHasQaName = includesQa(input.quotation.clientName) || startsWithQaPrefix(input.quotation.clientName);
    if (!quoteHasQaName) reasons.push("Quotation is not clearly tied to a QA client name.");
  }

  return {
    eligible: reasons.length === 0,
    roleAllowed,
    isQaLead: Boolean(input.lead && isClearlyQaWorkflowLead(input.lead)),
    reasons
  };
}

export const qaWorkflowSafetyMetadata = {
  qaWorkflowTestMode: true,
  noWhatsAppSend: true,
  noEmailSend: true,
  noCalendarBooking: true,
  noPriceGuideAutomation: true,
  noHardDelete: true,
  notRealClient: true
} as const;
