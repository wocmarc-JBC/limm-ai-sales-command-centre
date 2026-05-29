# Boss Operating Guide

This guide is for Marcus using the LIMM AI Sales Command Centre in controlled internal mode.

## Daily Start

1. Start the app with `.\START_INTERNAL_LAUNCH_SAFE.ps1`.
2. Login.
3. Confirm your role shows boss.
4. Open Settings/System Health.
5. Confirm OpenAI, WhatsApp, and Calendar are disabled.
6. Confirm Supabase/Auth status looks healthy.

## What To Check First

Start from the dashboard. It should answer what Marcus needs to handle today:

- Hot leads.
- Ready for appointment.
- Approval needed.
- Follow-up due.
- Ready for quotation review.
- System Health warnings.

## Lead Handling

Use lead detail before taking action. Check:

- Client name and source.
- Division.
- Property type.
- Scope summary.
- Lead score.
- Status.
- Next best action.
- Risk flags.
- Missing information.
- Appointment readiness.
- Quotation readiness.

For risky cases, keep the matter in boss review. Risky cases include landed extension, commercial projects, structural concerns, complaints, discounts, special appointment timing, and any price or timeline promise.

## Appointment Settings

Appointment days and times are controlled by settings.

- Do not assume Sunday is blocked.
- If Sunday is enabled, Sunday slots may appear.
- If Sunday is disabled, Sunday slots should not appear.
- Same-day booking and public holiday rules should follow the settings screen.

Use appointment settings carefully because changes affect booking recommendations.

## Quotation Readiness

The system does not create prices. It only helps decide whether a lead is ready for quotation review.

Check:

- Readiness score.
- Missing information.
- Boss review required.
- Preparation checklist.
- Next action.

If a client asks about cost, the safe path is to collect scope, floor plan, site photos, and project details, then move to quotation review.

## Follow-Ups

Use follow-ups for warm leads, missing information, and no-reply situations.

Do not use the system for bulk outreach. WhatsApp remains reply-only for the later phase and is currently disabled.

## Audit Log

The audit log is the operating record. Important actions should leave an audit entry.

Check audit logs after:

- Lead status changes.
- Appointment settings changes.
- Approval decisions.
- Follow-up completion or snooze.
- Quotation readiness updates.

## What Not To Do Yet

- Do not enable OpenAI live replies.
- Do not connect WhatsApp.
- Do not connect live calendar booking.
- Do not add public production traffic.
- Do not use real client files in the placeholder upload sections.
- Do not use the temporary review route unless a controlled UI review is planned.
