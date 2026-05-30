# Go Live Manual Steps

## Start Local App

1. Double-click `START_LIMM_SALES_APP.bat`, or run it from PowerShell.
2. Wait for the app to open `http://localhost:3000`.
3. Keep the server window open while using the app.

## Login

1. Open `/login`.
2. Enter the approved Supabase email and password.
3. Confirm the shell shows Marcus and role `boss`.

## Verify System Health

1. Open Settings.
2. Confirm mode is Supabase Mode when `.env.local` is configured.
3. Confirm OpenAI, WhatsApp, and Calendar show disabled.
4. Confirm RLS expected/enforced status is visible.

## Verify Review Route Lockdown

1. Confirm `NEXT_PUBLIC_ENABLE_REVIEW_ROUTE` is false or unset.
2. Open `/review-chatgpt-ui`.
3. Confirm the development review page is unavailable.
4. Do not enable the review route for production or client-facing use.

## Test Appointment Settings

1. Open Appointment Settings.
2. Change a non-risk setting such as buffer minutes.
3. Save.
4. Confirm the Audit Log records the action.
5. Restore the original setting.

## Test Lead Action

1. Open AI Lead Inbox.
2. Review a demo or test lead.
3. Change status.
4. Confirm the Audit Log records the action.

## Test Approval Action

1. Open Boss Approval Queue.
2. Approve, hold, or request more information on a test approval.
3. Confirm the Audit Log records the decision.

## Test Follow-Up Action

1. Open Follow-Up Queue.
2. Complete or snooze a test follow-up.
3. Confirm the Audit Log records the action.

## Run Launch Audit

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm.cmd run qa:browser
npm.cmd run qa:v4-3
npm.cmd run qa:dev-brain
node scripts/audit_v3_package.mjs
```

## Stop App Safely

Press `Ctrl+C` in the server window.

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

