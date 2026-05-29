# LIMM AI Sales Command Centre v3

Clean v3.0 live-app foundation for Marcus and LIMM Works. This scaffold is a dark-mode, boss-friendly command centre for renovation lead handling, appointment control, approval review, follow-ups, quotation readiness, reports, and audit visibility.

This is not production-ready yet. It uses mock data and disabled adapter interfaces so v3.1/v3.2 can add Supabase, OpenAI, calendar sync, and WhatsApp Cloud API safely.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase-ready SQL migrations
- Supabase-ready repository layer with mock fallback
- Mock AI decision schema
- Disabled OpenAI adapter interface
- Mock calendar adapter interface
- Safe WhatsApp reply-only adapter interface

## Run Locally

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verify

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm run test
npm run test:supabase
npm run audit
```

## Data Mode

The app chooses its data mode automatically:

- `Mock Mode` when `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing.
- `Supabase Mode` when both public Supabase values are set.

The service role key is reserved for future server-only work and is not imported by the app.

## Auth And Roles

v3.2 adds Supabase Auth/RLS foundation with these roles:

- `boss`
- `admin`
- `sales`
- `viewer`

Mock Mode allows demo boss access. Supabase Mode requires login, profile bootstrap, and RLS policies.

## Safety Posture

- No renovation price generation.
- No renovation quote ranges.
- Client replies must use `initial project review`, never the banned phrase.
- Risky cases route to Marcus approval.
- Appointment availability comes from settings only.
- Sunday is configurable and is not hardcoded as blocked.
- WhatsApp posture is reply-only, no blasting.
- `.env` and API keys must not be committed.
- `SUPABASE_SERVICE_ROLE_KEY` must stay server/script-only and is not used in app code.

## Demo Seed

```powershell
npm run seed:demo
```

With no Supabase env vars, this confirms mock data is active. With Supabase configured, use `supabase/seed.sql` after running migrations.

## Live Schema Verification

```powershell
npm run verify:live-supabase
```

If Supabase env vars are missing, this exits cleanly in Mock Mode. If present, it checks required tables and columns without printing secrets.

## Live Authenticated Action Verification

```powershell
$env:SUPABASE_TEST_EMAIL="TEST_USER_EMAIL"
$env:SUPABASE_TEST_PASSWORD="TEST_USER_PASSWORD"
npm run verify:live-actions
```

This is optional until a real Supabase test user exists. It creates test-marked records, verifies live authenticated reads/writes, and never deletes audit logs.

## Live Setup Checklist

```powershell
npm run setup:live-checklist
```

Full instructions are in `LIVE_SUPABASE_SETUP_GUIDE.md`.

## v2.1 Reference

v3.0 reads v2.1 only as a tested backend/safety reference. It does not copy or patch v2.1.
