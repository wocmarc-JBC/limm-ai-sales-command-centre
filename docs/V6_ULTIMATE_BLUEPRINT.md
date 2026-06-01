# V6 Ultimate Sales Command Centre Blueprint

## Current Architecture Summary

The app is a Next.js App Router CRM with protected pages for dashboard, leads, appointments, approvals, follow-ups, quotation readiness, settings, reports, audit log, and a locked review route. Data access is routed through repository modules under `lib/data`, with mock mode as a safe fallback and Supabase mode when environment variables are present.

The live WhatsApp pipeline is:

Meta WhatsApp webhook -> `app/api/whatsapp/webhook/route.ts` -> parser -> `handleWhatsAppInboundMessage` -> Supabase admin/write client -> lead upsert -> lead message save -> audit logs -> reply decision -> safety validation -> known-good WhatsApp text adapter.

The known-good WhatsApp send adapter contract must remain unchanged.

## Tables And Entities Detected

- `profiles`
- `leads`
- `lead_messages`
- `lead_ai_decisions`
- `appointments`
- `appointment_rules`
- `appointment_slots`
- `appointment_holds`
- `followups`
- `approval_requests`
- `client_files`
- `quotation_readiness`
- `audit_logs`
- `settings`
- `message_templates`
- `lead_outcomes`

## Safe Migration Strategy

V6 Ultimate uses additive-only fields for lead lifecycle, bot control, sales control, and readiness foundations. Existing tables are not rebuilt. New columns are optional and safe defaults preserve existing behavior. Repository code must tolerate missing columns during deployment by falling back to existing safe fields where needed.

## UI Pages And Routes Detected

- `/`
- `/login`
- `/leads`
- `/leads/[id]`
- `/appointments`
- `/appointment-settings`
- `/approvals`
- `/followups`
- `/quotation-readiness`
- `/client-files`
- `/reports`
- `/settings`
- `/audit-log`
- `/review-chatgpt-ui`
- `/api/whatsapp/health`
- `/api/whatsapp/debug-parse`
- `/api/whatsapp/webhook`

## WhatsApp Reply Pipeline Detected

The active deterministic reply decision path is `buildWhatsAppReplyDecision`, now backed by `lib/whatsapp-v6`. V6 Ultimate keeps this path and upgrades the visible version, QA coverage, health proof, and trace metadata. Optional AI remains off by default and cannot bypass the rule-based Safety Governor.

## Deletion And Cleanup Implementation Plan

- Normal delete is soft delete.
- Soft-deleted leads are hidden from active lists by default.
- Restore reactivates the lead and writes audit logs.
- Hard delete is boss/admin-only, requires prior soft delete and a reason, and writes audit before deletion.
- Audit logs are never hard-deleted through normal UI.

## Role And Permission Plan

Existing roles are `boss`, `admin`, `sales`, and `viewer`. V6 Ultimate adds explicit permissions for settings, soft delete, restore, hard delete, bot control, and QA view. Boss has all permissions. Admin can manage operational cleanup but not hard delete unless explicitly allowed. Sales can update/follow up but cannot delete permanently. Viewer is read-only.

## QA And Test Plan

V6 Ultimate keeps existing v5/v6 tests and adds `scripts/test_v6_ultimate_deep_qa.mjs` with 200+ checks covering:

- Singapore homeowner shorthand
- Context truth gate
- Safety governor
- No-silence behavior
- Media and voice fallback
- Email handoff
- Soft delete/restore/hard delete
- Roles and permissions
- Mission queue, scoring, summaries
- Settings, QA centre, gold UI, and health proof

## Rollback Plan

1. Disable WhatsApp public auto-reply with `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false`.
2. Redeploy/restart.
3. Confirm `/api/whatsapp/health` still responds.
4. If needed, revert the v6 Ultimate commit and redeploy the last known-good commit.
5. Keep Supabase audit logs intact.

## Risks And Mitigations

- Risk: live schema lags new additive columns. Mitigation: repository fallbacks and safe defaults.
- Risk: cleanup action deletes important data. Mitigation: soft delete by default, hard delete requires role, prior soft delete, reason, and audit.
- Risk: bot overclaims context. Mitigation: Context Truth Gate and regression QA.
- Risk: unsafe WhatsApp reply. Mitigation: Safety Governor, Quality Judge, no-silence fallback, package audit.
- Risk: unfinished features presented as live. Mitigation: health fields explicitly distinguish available foundations from disabled integrations.
