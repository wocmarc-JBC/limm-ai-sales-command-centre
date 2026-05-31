# Next Steps For ChatGPT

## Review First

1. Review `V5_0_WHATSAPP_SALES_BRAIN_AND_CALENDAR_FOUNDATION_REPORT.md`.
2. Review `V4_10_WHATSAPP_LIVE_PASS_REPORT.md`.
3. Review `WHATSAPP_LIVE_TEST_SETUP_GUIDE.md`.
4. Review `WHATSAPP_EMERGENCY_OFF_GUIDE.md`.
5. Review `CALENDAR_BOOKING_SETUP_GUIDE.md`.
6. Review `DEV_BRAIN_QA_REPORT.md`.
7. Confirm the review route remains disabled by default.

## Recommended Next Prompt For Marcus PowerShell

Prepare the next controlled verification phase after v5.0:

- Keep all v4.0-v4.8 safety rules unchanged.
- WhatsApp live reply-only auto-reply is confirmed PASS.
- v5.0 adds the WhatsApp Sales Brain and Calendar foundation.
- OpenAI WhatsApp reply is off by default.
- Calendar booking is disabled by default.
- Auto booking is disabled by default.
- Boss approval is required by default.
- Do not add pricing, quote ranges, or auto-pricing.
- Do not hardcode Sunday blocked.
- Do not weaken audit logs.
- Confirm `/review-chatgpt-ui` is unavailable by default.
- Run controlled WhatsApp message tests and review reply quality/audit metadata.
- Do not add autonomous booking or send bypass.

## Marcus PowerShell Commands

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm.cmd run build
npm.cmd run qa:browser
npm.cmd run qa:v4-3
npm.cmd run qa:dev-brain
node scripts/audit_v3_package.mjs
```

## What Codex Should Build Next

- v5.1 live observation and tuning pass after Marcus tests the five WhatsApp messages.
- Improve template wording only if Marcus finds tone issues.
- Add richer boss review/reporting for WhatsApp brain metadata.
- Prepare Google Calendar live setup only after Marcus approves Calendar credentials and workflow.

## Avoid

- Do not copy old review/demo surfaces into production.
- Do not expose `/review-chatgpt-ui` without the explicit review flag.
- Do not auto-generate prices.
- Do not enable WhatsApp blasting or autonomous approval bypass.
- Do not add WhatsApp broadcast or blasting.
- Do not hardcode secrets.
- Do not mark full production GO before backups, monitoring, and deployment hardening are complete.

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

