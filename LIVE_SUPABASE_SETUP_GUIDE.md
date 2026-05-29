# Live Supabase Setup Guide

This guide prepares the v3 Command Centre for a real Supabase project. Do not add OpenAI, WhatsApp live sending, or calendar booking in this phase.

## 1. Create Supabase Project

1. Go to Supabase.
2. Create a new project for LIMM AI Sales Command Centre.
3. Choose a strong database password and store it outside this repository.
4. Wait until the project is fully provisioned.

## 2. Copy Project URL And Anon Key

1. Open the Supabase project.
2. Go to Project Settings.
3. Open API.
4. Copy the Project URL.
5. Copy the anon public key.

## 3. Create `.env.local`

Create `.env.local` locally only. Do not commit it.

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
@"
NEXT_PUBLIC_SUPABASE_URL=PASTE_PROJECT_URL_HERE
NEXT_PUBLIC_SUPABASE_ANON_KEY=PASTE_ANON_PUBLIC_KEY_HERE
LIVE_AUTOSEND=false
WHATSAPP_MODE=safe_reply_only
CALENDAR_PROVIDER=mock
"@ | Set-Content .env.local
```

Do not put the service role key in frontend code. Do not paste real secrets into docs or chat.

## 4. Apply Migrations In Order

Open Supabase SQL Editor and run each migration in the order shown in `supabase/MIGRATION_ORDER.md`.

Use the verification query after each migration where listed. If a migration says it is safe to re-run, it uses `create table if not exists`, `alter table ... add column if not exists`, or `drop policy if exists`.

Important v3.4 note: make sure `017_v3_4_audit_log_actor_compatibility.sql` is applied. It permanently fixes audit log compatibility for schemas that require legacy `actor` while the app writes `actor_type` and `actor_name`.

## 5. Create Marcus Auth User

1. Go to Supabase Authentication.
2. Create a user for Marcus using his real email.
3. Set a secure password manually or send an invite.
4. Copy the user UUID from Supabase Auth.

No real password should be written into this repository.

## 6. Create Admin User If Needed

Repeat the same Authentication step for any admin user. Copy the admin user UUID.

## 7. Insert Matching Profiles

Open `supabase/bootstrap_profiles.sql`.

Replace placeholders only inside Supabase SQL Editor:

- `MARCUS_AUTH_USER_UUID`
- `MARCUS_EMAIL`
- `ADMIN_AUTH_USER_UUID`
- `ADMIN_EMAIL`

Run the relevant insert/update statements. Do not store real email/password pairs in source files.

## 8. Run Live Schema Verification

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm run verify:live-supabase
```

Expected result: PASS, or protected-by-RLS messages for tables that require login.

## 9. Optional Authenticated Action Verification

Only for a test account created in Supabase. Use a boss-role test profile because appointment settings are boss-only:

```powershell
$env:SUPABASE_TEST_EMAIL="TEST_USER_EMAIL"
$env:SUPABASE_TEST_PASSWORD="TEST_USER_PASSWORD"
npm run verify:live-actions
```

This creates test-marked records, verifies repository-style writes, and never deletes audit logs.

## 10. Start Local App

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm install
npm run dev
```

Open `http://localhost:3000`.

## 11. Login And Verify Dashboard

1. Go to `/login`.
2. Login as Marcus.
3. Open Settings.
4. Confirm:
   - Supabase Mode
   - Auth enabled
   - role is boss
   - OpenAI disabled
   - WhatsApp disabled
   - Calendar disabled
5. Open Audit Log and confirm records load without delete controls.
6. Open Appointment Settings and confirm Sunday is controlled by the settings form.

## Safety Notes

- Do not enable live WhatsApp sending.
- Do not add OpenAI live replies.
- Do not generate renovation pricing.
- Do not create quote ranges.
- Do not bypass RLS.
- Do not use service role key in frontend/app code.
