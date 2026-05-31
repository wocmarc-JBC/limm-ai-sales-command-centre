# Next Steps For ChatGPT

## Review First

1. Review `V5_3_WHATSAPP_REPLY_COACH_REPORT.md`.
2. Review `WHATSAPP_REPLY_COACH_PLAYBOOK.md`.
3. Review `WHATSAPP_NO_SILENCE_REPLY_RELIABILITY_RULES.md`.
4. Review `WHATSAPP_LIVE_INCIDENT_PLAYBOOK.md`.
5. Review `V5_2_WHATSAPP_QUESTION_BANK_REPORT.md`.
6. Review `WHATSAPP_QUESTION_BANK_PLAYBOOK.md`.
7. Review `V4_10_WHATSAPP_LIVE_PASS_REPORT.md`.
8. Confirm `/api/whatsapp/health` shows `version: v5_3_whatsapp_reply_coach` before any live WhatsApp retest.

## Recommended Next Prompt For Marcus PowerShell

Prepare the controlled live v5.3 WhatsApp retest:

- Keep all v4/v5 safety rules unchanged.
- Confirm health endpoint first; local PASS is not production PASS.
- v5.3 fixes the silence issue by changing the old 3-in-10-min reply threshold into a warning.
- Valid client text must go through Reply Coach, safety, repetition, quality, no-silence guard, audit trace, and send.
- OpenAI WhatsApp reply remains off.
- Calendar auto-booking remains off.
- No pricing, amount ranges, package prices, or booking confirmation before a real event exists.
- Test the exact v5.3 conversation sequence and inspect CRM audit logs for the black box reply trace.

## Marcus PowerShell Commands

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm.cmd run build
node scripts/test_v5_2_whatsapp_question_bank.mjs
node scripts/test_v5_3_whatsapp_reply_coach_replay.mjs
node scripts/audit_v3_package.mjs
```

## What Codex Should Build Next

- v5.4 should only happen after Marcus confirms v5.3 deployed health and live retest results.
- Recommended v5.4 scope: human takeover lock if a reliable manual-reply signal exists, plus trace viewer improvements for WhatsApp audit metadata.
- Optional OpenAI WhatsApp reply testing should remain disabled until v5.3 no-silence behavior is proven live.

## Avoid

- Do not enable OpenAI WhatsApp reply by default.
- Do not enable autonomous Calendar booking.
- Do not expose `/review-chatgpt-ui` without the explicit review flag.
- Do not auto-generate pricing or amount ranges.
- Do not add WhatsApp blasting or broadcast.
- Do not hardcode secrets.
- Do not live test before the deployed health endpoint proves the expected v5.3 fields.

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
