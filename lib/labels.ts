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
  quotation_readiness_score: "Quotation readiness score",
  initial_project_review: "Initial project review",
  site_discussion: "Site discussion",
  manager_call: "Manager call",
  quotation_review: "Quotation review",
  site_visit: "Site visit",
  phone_review: "Phone review",
  zoom_review: "Zoom review",
  landed_aa_review: "Landed A&A review",
  condo_renovation_review: "Condo renovation review",
  commercial_renovation_review: "Commercial renovation review",
  address_or_area: "Address or area",
  preferred_date_time: "Preferred date/time",
  floor_plan_or_site_photos: "Floor plan or site photos"
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
