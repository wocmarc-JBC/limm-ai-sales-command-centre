export type UserRole = "boss" | "admin" | "sales" | "viewer";

export type Permission =
  | "view_all"
  | "view_audit"
  | "update_leads"
  | "manage_followups"
  | "approve_requests"
  | "edit_appointment_settings"
  | "update_quotation_readiness"
  | "view_reports";

export const roleLabels: UserRole[] = ["boss", "admin", "sales", "viewer"];

const rolePermissions: Record<UserRole, Permission[]> = {
  boss: [
    "view_all",
    "view_audit",
    "update_leads",
    "manage_followups",
    "approve_requests",
    "edit_appointment_settings",
    "update_quotation_readiness",
    "view_reports"
  ],
  admin: [
    "view_all",
    "view_audit",
    "update_leads",
    "manage_followups",
    "approve_requests",
    "update_quotation_readiness",
    "view_reports"
  ],
  sales: ["view_all", "update_leads", "manage_followups"],
  viewer: ["view_all"]
};

export function can(role: UserRole, permission: Permission) {
  return rolePermissions[role]?.includes(permission) ?? false;
}
