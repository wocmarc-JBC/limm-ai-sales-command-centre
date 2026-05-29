# Launch Checklist

## Local Run Checklist

- Run `START_LIMM_SALES_APP.bat`.
- Confirm browser opens `http://localhost:3000`.
- Confirm app shows Mock Mode or Supabase Mode clearly.
- Run `npm run doctor`.
- Run `npm run verify`.
- Run `npm run audit:launch`.

## Supabase Checklist

- Project URL is copied into `.env.local`.
- Public anon key is copied into `.env.local`.
- Service role key is not used in frontend code.
- Migrations are applied in `supabase/MIGRATION_ORDER.md` order.
- `017_v4_0_audit_log_actor_compatibility.sql` is applied.

## Auth/RLS Checklist

- Marcus auth user exists.
- Marcus profile row exists.
- Marcus role is `boss`.
- RLS is enabled on core tables.
- Anonymous access is not allowed in Supabase Mode.

## Boss Profile Checklist

- Login succeeds.
- Header shows Marcus and boss role.
- Boss can view dashboard, leads, approvals, follow-ups, appointment settings, quotation readiness, settings, and audit log.

## Audit Log Checklist

- Lead status change writes audit log.
- Boss approval decision writes audit log.
- Follow-up action writes audit log.
- Appointment setting save writes audit log.
- Audit logs cannot be deleted through normal app actions.

## Appointment Settings Checklist

- Monday through Sunday can be configured.
- Sunday is controlled by settings.
- Same-day rule is visible.
- Public holiday rule is visible.
- Max appointments per day and buffer settings are visible.

## No-Pricing Safety Checklist

- No automatic amounts are generated.
- No quote ranges are generated.
- Quotation readiness shows score, missing info, checklist, and boss review status only.

## No-Free-Consultation Checklist

- Client-facing wording uses initial project review.
- Forbidden consultation wording is not used in replies or templates.

## Sunday Configurable Checklist

- Sunday disabled hides Sunday slots.
- Sunday enabled can show Sunday slots.
- Weekend approval can be required by settings.
- No permanent Sunday block exists.

## Environment / Secrets Checklist

- `.env` is not present.
- `.env.local` stays local only.
- No API keys are committed.
- Startup and doctor scripts never print secret values.

## Review Route Checklist

- `/review-chatgpt-ui` is development-only.
- Default production/internal launch behavior: unavailable unless explicitly enabled.
- Local UI review can enable it with `NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=true`.
- The route must never use live writes, real client data, or live actions.
- The route must never expose protected app shell behavior unless the explicit review flag is enabled.
- Keep the flag false/empty before production deployment.

## Deployment Readiness Checklist

- OpenAI remains disabled.
- WhatsApp remains disabled.
- Calendar remains disabled.
- `/review-chatgpt-ui` remains disabled by default.
- Backups and monitoring are planned before production.
