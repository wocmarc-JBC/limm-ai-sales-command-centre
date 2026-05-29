const labelMap: Record<string, string> = {
  floor_plan: "Floor plan",
  site_photos: "Site photos",
  preferred_contact_time: "Preferred contact time",
  design_direction: "Design direction",
  budget_range: "Budget direction",
  timeline: "Timeline",
  property_type: "Property type",
  scope_summary: "Scope summary",
  material_preference: "Material preference",
  landlord_requirements: "Landlord requirements",
  measurements: "Measurements",
  photos: "Photos",
  wet_works: "Wet works",
  landed_a_and_a: "Landed A&A",
  approval_review_needed: "Approval review needed",
  mcst_rules: "MCST rules",
  commercial: "Commercial",
  landlord_approval: "Landlord approval",
  privacy_requirements: "Privacy requirements",
  price_sensitive: "Amount sensitive",
  boss_review_required: "Boss review required",
  quotation_readiness_score: "Quotation readiness score"
};

export function humanizeLabel(value: string) {
  if (!value) return "";
  return labelMap[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function humanizeList(values: string[]) {
  return values.length ? values.map(humanizeLabel).join(", ") : "None";
}

export function humanizeDay(value: string) {
  return humanizeLabel(value);
}

export function humanizeAppointmentType(value: string) {
  return humanizeLabel(value);
}
