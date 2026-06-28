import { scoreTestLead } from "@/lib/test-lead-cleanup";
import type { ApprovalRequest, Lead, PaymentRecord, ProjectAccount, QuotationPackage } from "@/lib/types";

export type ProductionVisibilityOptions = {
  includeTestDemo?: boolean;
};

export const productionVisibilityNoiseTerms = [
  "test",
  "qa",
  "demo",
  "v3_live_test",
  "miamamun",
  "semon",
  "dummy",
  "sample",
  "generated test",
  "test approval"
] as const;

export const productionVisibilityNoisePattern = /(?:\b(?:test|qa|demo|dummy|sample)\b|v3[_ -]?live[_ -]?test|miamamun|semon|generated\s+test|test\s+approval)/i;

function stringify(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function containsProductionVisibilityNoise(...parts: unknown[]) {
  return productionVisibilityNoisePattern.test(parts.map(stringify).join("\n"));
}

export function getProductionLeadVisibilityReasons(lead: Lead) {
  const reasons: string[] = [];
  const score = scoreTestLead(lead);
  if (lead.isTest) reasons.push("Marked isTest");
  if (lead.isSpam) reasons.push("Marked isSpam");
  if (lead.archivedAt) reasons.push("Archived");
  if (lead.deletedAt) reasons.push("Soft deleted");
  if (score.clearlyTest) reasons.push(...score.reasons, ...score.weakReasons);
  if (containsProductionVisibilityNoise(
    lead.id,
    lead.clientName,
    lead.phone,
    lead.email,
    lead.source,
    lead.lastClientMessage,
    lead.scopeSummary,
    lead.missionCategory,
    lead.leadLevel,
    lead.salesNextAction,
    lead.stageNotes,
    lead.wonLostReason
  )) {
    reasons.push(`Contains production-hidden term: ${productionVisibilityNoiseTerms.join(", ")}`);
  }
  return [...new Set(reasons.filter(Boolean))];
}

export function isProductionHiddenLead(lead: Lead) {
  return getProductionLeadVisibilityReasons(lead).length > 0;
}

export function filterLeadsForProductionVisibility(leads: Lead[], options: ProductionVisibilityOptions = {}) {
  if (options.includeTestDemo) return leads;
  return leads.filter((lead) => !isProductionHiddenLead(lead));
}

export function isProductionHiddenApproval(request: ApprovalRequest, visibleLeadIds?: Set<string>) {
  if (visibleLeadIds && request.leadId && !visibleLeadIds.has(request.leadId)) return true;
  return containsProductionVisibilityNoise(
    request.id,
    request.leadId,
    request.title,
    request.approvalType,
    request.reason,
    request.aiRecommendation,
    request.proposedReply,
    request.riskFlags,
    request.notes,
    request.status
  );
}

export function filterApprovalsForProductionVisibility(
  approvalRequests: ApprovalRequest[],
  options: ProductionVisibilityOptions & { visibleLeadIds?: Set<string> } = {}
) {
  if (options.includeTestDemo) return approvalRequests;
  return approvalRequests.filter((request) => !isProductionHiddenApproval(request, options.visibleLeadIds));
}

export function isProductionHiddenProject(project: ProjectAccount, visibleLeadIds?: Set<string>) {
  if (project.isTest) return true;
  if (project.archivedAt || project.deletedAt) return true;
  if (visibleLeadIds) {
    const linkedLeadIds = [project.leadId, project.sourceLeadId].filter(Boolean);
    if (linkedLeadIds.length && linkedLeadIds.every((leadId) => !visibleLeadIds.has(leadId))) return true;
  }
  return containsProductionVisibilityNoise(
    project.id,
    project.leadId,
    project.sourceLeadId,
    project.clientName,
    project.phone,
    project.propertyType,
    project.scopeSummary,
    project.notes,
    project.status,
    project.projectAddress,
    project.locationNotes
  );
}

export function filterProjectsForProductionVisibility(
  projects: ProjectAccount[],
  options: ProductionVisibilityOptions & { visibleLeadIds?: Set<string> } = {}
) {
  if (options.includeTestDemo) return projects;
  return projects.filter((project) => !isProductionHiddenProject(project, options.visibleLeadIds));
}

export function isProductionHiddenPayment(payment: PaymentRecord, visibleProjectIds?: Set<string>, visibleLeadIds?: Set<string>) {
  if (payment.isTest) return true;
  if (visibleProjectIds && payment.projectId && !visibleProjectIds.has(payment.projectId)) return true;
  if (visibleLeadIds && payment.leadId && !visibleLeadIds.has(payment.leadId)) return true;
  return containsProductionVisibilityNoise(
    payment.id,
    payment.projectId,
    payment.leadId,
    payment.paymentType,
    payment.status,
    payment.notes,
    payment.voidReason
  );
}

export function isProductionHiddenQuotationPackage(quotation: QuotationPackage, visibleLeadIds?: Set<string>) {
  if (quotation.isTest) return true;
  if (quotation.voidedAt || quotation.status === "Voided") return true;
  if (visibleLeadIds && quotation.leadId && !visibleLeadIds.has(quotation.leadId)) return true;
  return containsProductionVisibilityNoise(
    quotation.id,
    quotation.leadId,
    quotation.clientName,
    quotation.quotationNumber,
    quotation.status,
    quotation.preparedBy,
    quotation.bossReviewedBy,
    quotation.sentBy,
    quotation.scopeSummary,
    quotation.bossNotes,
    quotation.revisionNotes,
    quotation.clientNotes,
    quotation.originalFileName,
    quotation.storagePath,
    quotation.qaRunId
  );
}

export function filterQuotationPackagesForProductionVisibility(
  quotations: QuotationPackage[],
  options: ProductionVisibilityOptions & { visibleLeadIds?: Set<string> } = {}
) {
  if (options.includeTestDemo) return quotations;
  return quotations.filter((quotation) => !isProductionHiddenQuotationPackage(quotation, options.visibleLeadIds));
}

export function filterPaymentsForProductionVisibility(
  payments: PaymentRecord[],
  options: ProductionVisibilityOptions & { visibleProjectIds?: Set<string>; visibleLeadIds?: Set<string> } = {}
) {
  if (options.includeTestDemo) return payments;
  return payments.filter((payment) => !isProductionHiddenPayment(payment, options.visibleProjectIds, options.visibleLeadIds));
}
