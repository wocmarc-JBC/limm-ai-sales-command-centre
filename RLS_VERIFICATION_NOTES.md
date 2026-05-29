# RLS Verification Notes

## What RLS Protects

RLS is enabled for all core tables:

- profiles
- leads
- lead_messages
- lead_ai_decisions
- appointments
- appointment_rules
- appointment_slots
- appointment_holds
- followups
- approval_requests
- client_files
- quotation_readiness
- audit_logs
- settings
- message_templates
- lead_outcomes

Policies are scoped to authenticated users only. No anonymous policies are added.

## Boss Access

Boss can view all operational records, update leads, approve/reject approval requests, edit appointment settings, update quotation readiness, view reports, and view audit logs.

## Admin Access

Admin can view operational records, update leads, manage follow-ups, update quotation readiness, create approval requests, approve requests where policy allows, and view audit logs. Admin should not bypass boss approval for risky renovation decisions in business logic.

## Sales Access

Sales can view leads, update normal lead progress, create follow-ups, and prepare appointment actions. Sales cannot approve risky actions or edit system-wide appointment rules.

## Viewer Access

Viewer is read-only. Viewer cannot change leads, approvals, appointment rules, settings, or audit logs.

## Audit Log Protection

Audit logs can be inserted by authenticated actions and viewed by boss/admin. No normal update or delete policy is created for audit logs.

## Temporary / Development-Friendly Areas

Sales can view all leads until assigned-lead ownership is implemented. This is acceptable for v3.3 verification but should be tightened before wider team rollout.

Admin approval policy is currently allowed for development. Marcus should decide whether admin can approve only non-risky actions in a later phase.

## Must Test With Real Users

Before production:

1. Login as boss and confirm full access.
2. Login as admin and confirm settings restrictions match Marcus's preference.
3. Login as sales and confirm appointment settings and risky approval actions are blocked.
4. Login as viewer and confirm no write actions work.
5. Confirm anonymous browser access cannot read Supabase data.
6. Confirm audit logs cannot be deleted through UI or normal authenticated client.
