# V3 Foundation Test Cases

These cases are enforced by `scripts/test_v3_foundation.mjs` and `scripts/audit_v3_package.mjs`.

## Safety

- Client replies do not contain the banned phrase.
- Client replies do not contain renovation price estimates.
- Quotation readiness does not show renovation prices.
- Quotation readiness does not generate renovation quote ranges.
- Risky mock leads require Marcus review.

## Appointment Rules

- Sunday exists in appointment settings.
- Sunday enabled returns Sunday slot examples.
- Sunday disabled hides Sunday slots.
- Weekend approval comes from config.
- Appointment type settings control available slots.

## App Coverage

- Dashboard page exists.
- AI lead inbox page exists.
- Lead detail page exists.
- Appointment command centre page exists.
- Appointment settings page exists.
- Boss approval queue page exists.
- Follow-up queue page exists.
- Quotation readiness page exists.
- Client files page exists.
- Reports page exists.
- Settings page exists.
- Audit log page exists.

## Package Audit

- No `.env`.
- No hardcoded secrets.
- No `node_modules`.
- No `.next`.
- No `__pycache__`.
- No build cache folders.
- No copied v2 folder.

## v3.1 Persistence

- Mock Mode works when Supabase env vars are missing.
- Supabase adapter uses public URL and anon key only.
- Service role key is not imported in application code.
- UI pages use repositories instead of direct mock data.
- Lead status updates write audit logs.
- Approval decisions write audit logs.
- Follow-up updates write audit logs.
- Quotation readiness updates write audit logs.

## v3.2 Auth/RLS

- Login page exists with email/password UI.
- Mock Mode allows demo access.
- Supabase Mode requires auth.
- Roles `boss`, `admin`, `sales`, `viewer` exist.
- Server actions call `requirePermission`.
- RLS is enabled for every core table.
- Policies target authenticated users, not anonymous users.
- Audit logs have no delete policy.
- Appointment settings edits are role-restricted.
- Approval decisions are role-restricted.
