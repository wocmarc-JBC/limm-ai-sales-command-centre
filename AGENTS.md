# AGENTS.md

## Project

LIMM AI Sales Command Centre v3 lives at:

`C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3`

v2.1 reference lives at:

`C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Agent_v2`

Do not modify v2.1 unless Marcus explicitly asks.

## Setup Commands

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm install
npm run dev
```

## Test And Audit Commands

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm run test
npm run test:supabase
npm run test:auth
npm run test:live-setup
npm run audit
```

## Build Command

```powershell
npm run build
```

Do not leave `.next`, `node_modules`, `dist`, `build`, cache files, logs, or exports inside a release package.

## Code Style

- TypeScript first.
- Keep domain logic in `lib`.
- Keep UI components in `components`.
- Keep pages thin and action-first.
- Keep business rules explicit and testable.
- Avoid hardcoded operational assumptions.

## Business Rules

- Do not auto-generate renovation prices.
- Do not generate quote ranges.
- Do not say `free consultation` in client replies.
- Use `initial project review`.
- Do not promise authority approval.
- Do not promise exact timeline.
- Do not give final structural, legal, or submission advice.
- Risky cases need Marcus approval.
- WhatsApp is reply-only lead handling, no blasting.
- Target live running cost should remain around S$100/month where practical.

## Appointment Rules

- Appointment days and times must be configurable.
- Do not hardcode Sunday as blocked.
- Sunday may be allowed when Marcus enables it.
- Standard slots, appointment types, minimum notice, max appointments per day, buffers, same-day rule, public holiday rule, and boss approval rules must come from settings.

## Secrets

- Do not commit `.env`.
- Do not hardcode OpenAI, Supabase, Meta, WhatsApp, or calendar credentials.
- `.env.example` may contain blank variable names only.

## Done Criteria

Before saying done, run tests and audit. Report limitations honestly. Do not claim production-ready for v3.0.

## v3.1 Persistence Layer

- UI pages must call repositories in `lib/data`, not `lib/mock-data` directly.
- Repositories must support Supabase Mode and Mock Mode.
- Important actions must call `createAuditLog`.
- Do not expose or import `SUPABASE_SERVICE_ROLE_KEY` in app, component, or lib TypeScript.
- Keep mock fallback working when Supabase env vars are absent.
- Keep OpenAI live replies, WhatsApp live send, and real calendar booking disabled until a later approved phase.

## v3.2 Auth/RLS Foundation

- Roles are `boss`, `admin`, `sales`, `viewer`.
- Supabase Mode must require auth.
- Mock Mode may allow demo boss access.
- RLS policies live in `supabase/migrations/016_v3_2_auth_rls.sql`.
- UI role restrictions are helpful, but server actions must also call `requirePermission`.
- Audit logs must not expose update/delete actions to normal users.
- Do not add anonymous Supabase policies.

## v3.3 Live Supabase Verification

- Live setup guide: `LIVE_SUPABASE_SETUP_GUIDE.md`.
- Migration order: `supabase/MIGRATION_ORDER.md`.
- Profile bootstrap placeholders: `supabase/bootstrap_profiles.sql`.
- RLS notes: `RLS_VERIFICATION_NOTES.md`.
- Live schema verifier must skip cleanly when env vars are missing.
- Authenticated live verifier must skip cleanly when test credentials are missing.
- Never hardcode Supabase test credentials.
- Never delete audit logs during verification.

---

# Live Integration Rule

For any real external integration such as WhatsApp, Meta, Calendar, payment, email, OpenAI actions, SMS, webhook, or client-facing automation, do not treat Codex PASS, local QA, browser QA, build PASS, package audit, or webhook GET verification as production proof.

Before Marcus tests any live action, the deployed production app must have:
- production health endpoint
- deployed version marker
- safe env booleans
- first-line production logs
- phase-by-phase logs
- safe JSON errors
- no top-level env/import crashes
- server-only secret proof
- audit log proof
- kill switch and rollback guide

Full rule: see `LIVE_INTEGRATION_PRODUCTION_PROOF_PLAYBOOK.md`.

