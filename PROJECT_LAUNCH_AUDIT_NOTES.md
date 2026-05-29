# Project Launch Audit Notes

## Already Good

- Next.js, TypeScript, and Tailwind app foundation exists.
- Supabase-ready repository layer exists with mock fallback.
- Auth/RLS foundation exists with boss/admin/sales/viewer roles.
- Lead inbox, lead detail, appointments, approval queue, follow-ups, quotation readiness, settings, reports, client files, and audit log routes exist.
- Review route is isolated to mock data and no live actions.
- Appointment rules are configurable, including Sunday.
- Quotation readiness uses readiness scoring and missing information instead of generated amounts.
- Audit log repository writes both legacy `actor` and newer actor fields.

## Broken Before v4.0 Pass

- Startup relied on manual `npm run dev`; Windows could show `next` not recognized when dependencies were missing.
- Lead cards exposed too many equal action buttons.
- Missing-info and risk labels used technical field names.
- System Health lacked launch-style checks such as audit writability and environment status.
- v4.0 migration filename was not yet present.
- No doctor script, startup script, backup guide, or launch checklist existed.

## Missing Before v4.0 Pass

- Rule-based next best action engine.
- Approval gate matrix.
- Local startup scripts for non-technical launch.
- Launch candidate audit script.
- Export/backup guidance.

## Risky

- Live integrations remain intentionally disabled.
- `.env.local` can contain real credentials locally and must never be shared.
- The review route is temporary and must be removed before production.
- Supabase live data safety depends on applying all migrations and confirming RLS with real users.

## Must Be Fixed Before Launch

- Apply the v4.0 audit actor compatibility migration to live Supabase if it has not already been applied.
- Confirm Marcus boss profile exists and can login.
- Confirm audit logs are written after lead, approval, follow-up, and appointment settings actions.
- Confirm appointment settings can be saved and Sunday behavior follows settings.
- Run `npm run doctor`, `npm run verify`, and `npm run audit:launch`.

## Can Wait Until After Launch

- OpenAI live brain.
- WhatsApp reply-only integration.
- Google Calendar live booking.
- Full file upload and Supabase Storage.
- Production monitoring and scheduled backups.
