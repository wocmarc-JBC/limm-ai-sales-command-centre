# Next Steps For ChatGPT

## Review First

1. Review `V4_9_LIVE_DEPLOYMENT_READINESS_REPORT.md`.
2. Review `VERCEL_DEPLOYMENT_GUIDE.md`.
3. Review `PRODUCTION_ENV_VARS_CHECKLIST.md`.
4. Review `META_WHATSAPP_WEBHOOK_LIVE_SETUP.md`.
5. Review `DEV_BRAIN_QA_REPORT.md`.
6. Confirm the review route is still disabled by default before deployment.

## Recommended Next Prompt For Marcus PowerShell

Run the v4.9 deployment readiness verification:

- Keep all v4.0-v4.8 safety rules unchanged.
- Do not enable public WhatsApp auto-reply.
- Do not enable Calendar.
- Do not add pricing, quote ranges, or auto-pricing.
- Do not hardcode Sunday blocked.
- Do not weaken audit logs.
- Confirm `/review-chatgpt-ui` is unavailable by default.
- Confirm the production webhook route is `/api/whatsapp/webhook`.
- Re-run browser QA, v4.3 boss-write QA, Dev Brain QA, build, and the package audit.
- Produce PASS/FAIL and Go/No-Go for Vercel deployment readiness.

## Marcus PowerShell Commands

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm.cmd run qa:browser
npm.cmd run qa:v4-3
npm.cmd run qa:dev-brain
node scripts/audit_v3_package.mjs
```

## What Codex Should Build Next

- Help Marcus deploy the CRM to Vercel.
- Add Vercel environment variables without exposing secrets.
- Confirm `/login` loads on the Vercel URL.
- Confirm `/review-chatgpt-ui` is unavailable by default.
- Set Meta callback URL to `https://YOUR-VERCEL-URL/api/whatsapp/webhook`.
- Verify Meta webhook with matching `WHATSAPP_VERIFY_TOKEN`.
- Keep `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false` until inbound logging is confirmed.
- Add monitoring/error reporting plan before public production.
- Prepare the next integration phase design, but keep Calendar booking, public auto-reply, and pricing disabled until Marcus approves.

## Avoid

- Do not copy old review/demo surfaces into production.
- Do not expose `/review-chatgpt-ui` without the explicit review flag.
- Do not auto-generate prices.
- Do not enable public WhatsApp auto-reply.
- Do not add WhatsApp broadcast or blasting.
- Do not hardcode secrets.
- Do not mark full production GO before backups, monitoring, and deployment hardening are complete.
