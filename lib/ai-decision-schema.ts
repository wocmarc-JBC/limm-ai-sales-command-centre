import type { AiDecision } from "./types";

export const aiDecisionSchemaKeys: Array<keyof AiDecision> = [
  "division",
  "property_type",
  "service_type",
  "scope_summary",
  "lead_score",
  "lead_category",
  "missing_info",
  "risk_flags",
  "appointment_suitable",
  "appointment_type",
  "auto_booking_allowed",
  "boss_approval_needed",
  "quotation_readiness_score",
  "quote_preparation_checklist",
  "client_reply",
  "internal_notes"
];

export function validateAiDecisionShape(value: Partial<AiDecision>) {
  const missing = aiDecisionSchemaKeys.filter((key) => !(key in value));
  return {
    ok: missing.length === 0,
    missing
  };
}

export const safeMockAiDecision: AiDecision = {
  division: "LIMM Works",
  property_type: "old inter-terrace",
  service_type: "landed A&A",
  scope_summary: "wet kitchen extension, bathrooms, roofline and drainage review",
  lead_score: 92,
  lead_category: "Hot",
  missing_info: ["floor_plan", "site_photos", "preferred_contact_time"],
  risk_flags: ["landed_a_and_a", "wet_works", "approval_review_needed"],
  appointment_suitable: true,
  appointment_type: "site_discussion",
  auto_booking_allowed: false,
  boss_approval_needed: true,
  quotation_readiness_score: 62,
  quote_preparation_checklist: [
    { item: "Property type confirmed", status: "complete" },
    { item: "Main renovation scope captured", status: "complete" },
    { item: "Floor plan or drawings received", status: "missing" },
    { item: "Site photos received", status: "missing" },
    { item: "Design or material direction captured", status: "complete" },
    { item: "Timeline captured", status: "complete" }
  ],
  client_reply:
    "Thanks, this can be prepared for an initial project review. Please send the floor plan, site photos, and a preferred contact time so my manager can review the matter properly before any quotation is shared.",
  internal_notes: "Hot landed enquiry. Boss approval required before appointment confirmation or quotation discussion."
};
