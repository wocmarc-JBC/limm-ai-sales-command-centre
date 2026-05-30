# v4.9 Live Deployment Readiness Report

Status: PASS for Vercel deployment readiness.

## Scope

v4.9 prepares the CRM for Vercel deployment and production WhatsApp webhook readiness. Marcus has since approved live WhatsApp auto-reply for the current number only. Calendar booking, auto-pricing, quote ranges, rough estimates, blasting, and approval bypass remain disabled.

## Files Changed

- `.gitignore`
- `package.json`
- `package-lock.json`
- `components/ShellChrome.tsx`
- `lib/actions.ts`
- `scripts/run_playwright_if_available.mjs`
- `scripts/dev_brain_qa.mjs`
- `scripts/generate_chatgpt_handoff_report.mjs`
- `scripts/audit_v3_package.mjs`
- `scripts/test_v4_9_deployment_readiness.mjs`
- `CURRENT_STATUS.md`
- `NEXT_STEPS_FOR_CHATGPT.md`
- `KNOWN_LIMITATIONS.md`
- `PRODUCTION_ENV_VARS_CHECKLIST.md`
- `VERCEL_DEPLOYMENT_GUIDE.md`
- `META_WHATSAPP_WEBHOOK_LIVE_SETUP.md`
- `WHATSAPP_EMERGENCY_OFF_GUIDE.md`
- `CHATGPT_HANDOFF_REPORT.md`
- `DEV_BRAIN_QA_REPORT.md`
- `V4_2_FULL_BROWSER_HUMAN_QA_REPORT.md`
- `V4_9_LIVE_DEPLOYMENT_READINESS_REPORT.md`

## Deployment-Ready Status

Deployment-ready: yes, for deploying the CRM to Vercel.

The app remains a standard Next.js app:

- Build command: `npm run build`
- Start command: `npm run start`
- WhatsApp webhook route: `/api/whatsapp/webhook`
- Expected production webhook URL: `https://YOUR-VERCEL-URL/api/whatsapp/webhook`
- No `vercel.json` required for v4.9
- No hardcoded local tunnel URL
- Review route disabled by default
- Public WhatsApp auto-reply disabled by default unless Marcus explicitly enables approved live mode in deployment env vars

## Vercel Guide

Created: yes.

File: `VERCEL_DEPLOYMENT_GUIDE.md`

## Production Env Checklist

Created: yes.

File: `PRODUCTION_ENV_VARS_CHECKLIST.md`

Critical safe defaults:

- `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false`
- `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false`
- `OPENAI_BRAIN_DRY_RUN=false`
- `NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=false`

## WhatsApp Live Webhook Setup Guide

Created: yes.

File: `META_WHATSAPP_WEBHOOK_LIVE_SETUP.md`

The guide instructs Marcus to:

- Use the Vercel HTTPS callback URL.
- Match Meta verify token with `WHATSAPP_VERIFY_TOKEN`.
- Subscribe to the `messages` webhook field.
- Use Marcus-approved live mode only after confirming health booleans.
- Confirm inbound logging, outbound message save, and audit logs after the first live test message.

## Production Safety Checks

Result: PASS.

Verified:

- No WhatsApp access token in frontend/client code.
- No Supabase service role key in frontend/client code.
- Public auto-reply false by default, and Marcus-approved live mode explicitly documented.
- Test auto-reply false by default.
- No pricing, quote ranges, or rough estimates in checked client-facing surfaces.
- No Calendar booking.
- No forbidden consultation wording in checked reply surfaces.
- Review route disabled by default.
- Production webhook route exists.
- Webhook GET verification exists.
- Webhook POST handler exists.

## Build Result

Result: PASS.

Command run:

```powershell
npm.cmd run build
```

Notes:

- The build first exposed two TypeScript-only issues that dev mode did not catch.
- Fixed typed navigation links in `components/ShellChrome.tsx`.
- Fixed AI draft review status narrowing in `lib/actions.ts`.
- Final build completed successfully and included `/api/whatsapp/webhook`.

## Browser QA Result

Result: PASS with manual auth required.

Command run:

```powershell
npm.cmd run qa:browser
```

Result:

- 76 passed
- 10 skipped because this shell did not have `SUPABASE_TEST_EMAIL` / `SUPABASE_TEST_PASSWORD`

## v4.3 Boss-Write QA Result

Result in this Codex shell: skipped because boss test credentials were not present.

Command run:

```powershell
npm.cmd run qa:v4-3
```

Result:

- 6 skipped locally due missing `SUPABASE_TEST_EMAIL` / `SUPABASE_TEST_PASSWORD`
- Latest Marcus-confirmed authenticated v4.3 result remains PASS, 6 passed

## Dev Brain QA Result

Result: PASS with manual auth required.

Command run:

```powershell
npm.cmd run qa:dev-brain
```

Notes:

- Dev Brain installed dependencies, ran browser QA, generated reports, cleaned artifacts, ran static tests, and ran package audit.
- Live Supabase schema verification was skipped in this runner due network fetch failure.
- Authenticated live actions remain manual in this runner because credentials were not provided.
- Static app, safety, WhatsApp, OpenAI dry-run, and package checks passed.

## Package Audit Result

Result: PASS.

Command run after cleanup:

```powershell
node scripts\audit_v3_package.mjs
```

Generated folders were cleaned before final audit:

- `node_modules`
- `.next`
- `test-results`
- `playwright-report`

## Bugs Found And Fixed

- Production build failed on typed route navigation. Fixed by rendering review anchors separately and keeping app nav typed-safe.
- Production build failed on AI draft review status typing. Fixed by validating `pending` before narrowing.
- Browser QA wrapper could fail after generated folder cleanup because its summary folder was missing. Fixed by recreating the summary directory before writing output.
- Dev Brain static test found `.gitignore` missing `screenshots/`. Fixed by ignoring `screenshots/` and `.codex-tools/`.

## Bugs Remaining

None known in v4.9 deployment readiness code.

Manual items remain:

- Vercel deployment URL is not created yet.
- Meta WhatsApp number is not registered yet.
- Meta webhook is not verified yet.
- First production inbound WhatsApp message is not confirmed yet.
- Marcus-approved live auto-reply must be confirmed after redeploy using `/api/whatsapp/health` and one live WhatsApp test message.

## Exact Next Human Steps For Marcus

1. Deploy the app to Vercel using `VERCEL_DEPLOYMENT_GUIDE.md`.
2. Add Vercel environment variables from `PRODUCTION_ENV_VARS_CHECKLIST.md`.
3. Confirm `/login` loads on the Vercel URL.
4. Confirm `/review-chatgpt-ui` is unavailable by default.
5. Register the WhatsApp number in Meta.
6. Set Meta callback URL to `https://YOUR-VERCEL-URL/api/whatsapp/webhook`.
7. Set the Meta Verify Token to match `WHATSAPP_VERIFY_TOKEN`.
8. Subscribe to the `messages` webhook field.
9. Confirm `/api/whatsapp/health` shows the required live-mode booleans.
10. Send one inbound WhatsApp test message.
11. Confirm lead/message/audit logging in the CRM.
12. Confirm WhatsApp auto-reply is sent or an exact blocked/failed reason is audited.

## Go / No-Go Recommendation

GO only for deploying the CRM to Vercel.

GO for Marcus-approved live WhatsApp auto-reply only after:

- Vercel live URL exists.
- Meta webhook verifies.
- WhatsApp number is registered.
- `/api/whatsapp/health` confirms required booleans.
- First inbound message is confirmed.
- Auto-reply sent, blocked, or failed status is visible in audit logs.

Still NO-GO:

- WhatsApp blasting or any non-reply campaign sending.
- Calendar booking.
- Auto-pricing.
- Quote ranges.
- WhatsApp blasting.
