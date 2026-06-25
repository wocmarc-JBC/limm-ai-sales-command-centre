import { buildLeadFacts } from "./lead-facts";
import type { Lead } from "./types";

const checklistItems = [
  "Property type confirmed",
  "Main renovation scope captured",
  "Floor plan or drawings received",
  "Site photos received",
  "Design or material direction captured",
  "Timeline captured",
  "Budget direction captured if comfortable",
  "Preferred contact time captured"
];

export function buildQuotationReadiness(lead: Lead) {
  const facts = buildLeadFacts(lead);
  const complete = new Set<string>();
  if (facts.propertyType.value) complete.add("Property type confirmed");
  if (facts.scopeSummary.value) complete.add("Main renovation scope captured");
  if (facts.floorPlanReceived.value) complete.add("Floor plan or drawings received");
  if (facts.sitePhotosReceived.value) complete.add("Site photos received");
  if (facts.referenceImagesReceived.value || !facts.missingFields.includes("design_direction")) complete.add("Design or material direction captured");
  if (!facts.missingFields.includes("timeline")) complete.add("Timeline captured");
  if (facts.budgetExpectation.value) complete.add("Budget direction captured if comfortable");
  if (facts.appointmentPreference.value || lead.preferredContactTime) complete.add("Preferred contact time captured");

  const quote_preparation_checklist = checklistItems.map((item) => ({
    item,
    status: complete.has(item) ? ("complete" as const) : ("missing" as const)
  }));
  const quotation_readiness_score = Math.round((complete.size / checklistItems.length) * 100);
  const boss_review_required = quotation_readiness_score >= 50 || lead.riskFlags.length > 0;
  const missing_information = quote_preparation_checklist.filter((item) => item.status === "missing").map((item) => item.item);

  return {
    id: `qr-${lead.id}`,
    leadId: lead.id,
    quotation_readiness_score,
    readinessScore: quotation_readiness_score,
    boss_review_required,
    bossReviewRequired: boss_review_required,
    missing_information,
    missingInfo: missing_information,
    quote_preparation_checklist,
    quotePreparationChecklist: quote_preparation_checklist,
    status: boss_review_required ? ("ready_for_boss_review" as const) : ("collecting_info" as const),
    next_action: boss_review_required
      ? "Marcus to review quotation readiness before any quotation is shared."
      : "Collect more project details before quotation review.",
    nextAction: boss_review_required
      ? "Marcus to review quotation readiness before any quotation is shared."
      : "Collect more project details before quotation review.",
    updatedAt: new Date().toISOString()
  };
}
