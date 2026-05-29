# Current Status

## v4.9 Live Deployment Readiness

Status: v4.9 Vercel deployment and production WhatsApp webhook readiness implemented.

Current goal:

- Deploy the CRM to Vercel.
- Keep public WhatsApp auto-reply disabled.
- Prepare the production webhook URL for Meta verification.
- Confirm inbound WhatsApp logging before Marcus manually enables any closed-test auto-reply.

Deployment readiness files:

- `PRODUCTION_ENV_VARS_CHECKLIST.md`
- `VERCEL_DEPLOYMENT_GUIDE.md`
- `META_WHATSAPP_WEBHOOK_LIVE_SETUP.md`
- `V4_9_LIVE_DEPLOYMENT_READINESS_REPORT.md`

Go/No-Go:

- GO for deploying the CRM to Vercel.
- NO-GO for public WhatsApp auto-reply until the Vercel URL exists, Meta verifies the webhook, the WhatsApp number is registered, inbound logging is confirmed, and Marcus manually enables closed-test auto-reply.

## v4.4 Production Lockdown / Internal Launch Gate

Status: V4.4 REVIEW ROUTE LOCKDOWN IMPLEMENTED.

Confirmed baseline from Marcus:

- v4.2 Full Browser Human QA: PASS / GO.
- v4.3 Authenticated Boss-Write Browser QA: PASS / GO for v4.3 scope.
- Dev Brain QA: PASS.
- Live Supabase schema verifier: PASS.
- Authenticated live actions verifier: PASS.
- Playwright browser QA: PASS.
- Package audit: PASS.
- Bugs remaining: none.

New v4.4 lockdown work:

- `/review-chatgpt-ui` is now development-only.
- The review route is unavailable by default.
- To enable it for local UI review, set `NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=true`.
- Shell/auth exemptions for the review route only apply when that flag is explicitly enabled.
- Normal app routes are unchanged.
- Internal QA scripts are preserved.
- Tests and package audit now check that the review route is flag-gated.

## Production Safety Status

- OpenAI live brain remains disabled.
- WhatsApp public auto-reply remains disabled.
- WhatsApp closed-test code exists but stays behind kill switches.
- Calendar remains disabled.
- No pricing, quote ranges, estimated prices, package prices, or rough estimates were added.
- Sunday remains configurable by appointment settings.
- Audit logs remain required for important actions.
- Credentials and passwords were not printed or stored.

## Verification Note

Bundled-Node checks passed in this Codex run:

- `scripts/test_v3_foundation.mjs`
- `scripts/test_v3_supabase_layer.mjs`
- `scripts/test_v3_auth_rls_static.mjs`
- `scripts/test_v3_live_setup_static.mjs`
- `scripts/test_v3_review_route_static.mjs`
- `scripts/test_v4_1_dev_brain_static.mjs`
- `scripts/test_v4_launch_candidate.mjs`
- `scripts/audit_v3_package.mjs`

This Codex sandbox cannot run Marcus's normal PowerShell browser commands because `npm.cmd` is unavailable here and plain `node.exe` is blocked. Marcus PowerShell must run the final browser commands:

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm.cmd run qa:browser
npm.cmd run qa:v4-3
npm.cmd run qa:dev-brain
node scripts/audit_v3_package.mjs
```

## Must Not Be Changed Before Internal Launch

- Do not enable OpenAI live actions.
- Do not enable public WhatsApp live sending.
- Do not enable Google Calendar live booking.
- Do not generate prices or amount ranges.
- Do not hardcode Sunday as blocked.
- Do not weaken audit logs.
- Do not enable `/review-chatgpt-ui` in production.

## v4.8 WhatsApp Closed Test Status

Status: WhatsApp Marcus-only closed test auto-reply is implemented behind kill switches.

Default state remains safe:

- `WHATSAPP_LIVE_INBOUND_ENABLED=false`
- `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false`
- `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false`
- `WHATSAPP_TEST_MODE=true`

Closed test may be enabled only when Marcus is the expected test client and public auto-reply remains disabled. Calendar booking, public production auto-reply, blasting, and pricing remain NO-GO.

## v4.9 Deployment Status

The app remains a standard Next.js app:

- Build command: `npm run build`
- Production webhook route: `/api/whatsapp/webhook`
- Expected Meta callback URL: `https://YOUR-VERCEL-URL/api/whatsapp/webhook`
- No local tunnel URL is hardcoded.
- Review route is disabled by default.
- Service role and WhatsApp access tokens remain server-only.
