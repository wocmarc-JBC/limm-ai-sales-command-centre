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
  const complete = new Set<string>();
  if (lead.propertyType) complete.add("Property type confirmed");
  if (lead.scopeSummary) complete.add("Main renovation scope captured");
  if (!lead.missingInfo.includes("floor_plan")) complete.add("Floor plan or drawings received");
  if (!lead.missingInfo.includes("site_photos")) complete.add("Site photos received");
  if (!lead.missingInfo.includes("design_direction")) complete.add("Design or material direction captured");
  if (!lead.missingInfo.includes("timeline")) complete.add("Timeline captured");
  if (!lead.missingInfo.includes("budget_range")) complete.add("Budget direction captured if comfortable");
  if (lead.preferredContactTime) complete.add("Preferred contact time captured");

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
