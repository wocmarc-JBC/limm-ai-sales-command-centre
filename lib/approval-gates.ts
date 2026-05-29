export type ApprovalGate = {
  key: string;
  label: string;
  autoSafe: boolean;
  requiresMarcusApproval: boolean;
  reason: string;
};

export const approvalGateMatrix: ApprovalGate[] = [
  {
    key: "acknowledge_enquiry",
    label: "Acknowledge enquiry",
    autoSafe: true,
    requiresMarcusApproval: false,
    reason: "Simple acknowledgement with no promises."
  },
  {
    key: "ask_for_floor_plan",
    label: "Ask for floor plan",
    autoSafe: true,
    requiresMarcusApproval: false,
    reason: "Safe detail collection."
  },
  {
    key: "ask_for_site_photos",
    label: "Ask for site photos",
    autoSafe: true,
    requiresMarcusApproval: false,
    reason: "Safe detail collection."
  },
  {
    key: "ask_for_scope",
    label: "Ask for scope, property type, and timeline",
    autoSafe: true,
    requiresMarcusApproval: false,
    reason: "Safe discovery before review."
  },
  {
    key: "client_amount_request",
    label: "Any client-facing amount discussion",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "No automatic amounts or ranges are allowed."
  },
  {
    key: "price_estimate",
    label: "Price or estimate request",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "Any client-facing amount discussion must be reviewed by Marcus."
  },
  {
    key: "timeline_commitment",
    label: "Timeline commitment",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "The system must not promise exact completion dates."
  },
  {
    key: "timeline_promise",
    label: "Timeline promise",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "The system must not promise exact completion dates."
  },
  {
    key: "authority_submission",
    label: "Authority or submission statement",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "The system must not promise approval or final submission advice."
  },
  {
    key: "authority_statement",
    label: "Authority statement",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "Authority, submission, permit, and approval comments need Marcus review."
  },
  {
    key: "landed_extension",
    label: "Landed extension or A&A",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "Higher-risk landed scope needs Marcus review."
  },
  {
    key: "commercial_project",
    label: "Commercial project",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "Commercial scopes may involve landlord, compliance, and operational constraints."
  },
  {
    key: "complaint_or_damage",
    label: "Complaint, defect, damage, refund, or legal threat",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "Client issue handling must go to manager review."
  },
  {
    key: "structural_concern",
    label: "Structural concern",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "Structural feasibility must not be confirmed automatically."
  },
  {
    key: "complaint",
    label: "Complaint",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "Complaint handling must go to manager review."
  },
  {
    key: "discount_request",
    label: "Discount request",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "Discount positioning affects margin and brand tone."
  },
  {
    key: "special_appointment_timing",
    label: "Special appointment timing",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "Same-day, weekend, and public holiday rules can require approval."
  },
  {
    key: "high_value_rejection",
    label: "Reject high-value lead",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "High-value leads should not be rejected automatically."
  },
  {
    key: "risky_site_visit",
    label: "Risky site visit",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "Risky site conditions or special timing should be reviewed before confirming."
  },
  {
    key: "reject_high_value_lead",
    label: "Reject high-value lead",
    autoSafe: false,
    requiresMarcusApproval: true,
    reason: "High-value leads should not be rejected automatically."
  }
];
