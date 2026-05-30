# WhatsApp Emergency Off Guide

Use this if WhatsApp auto-reply must stop immediately.

## Fastest Kill Switch

Set this in `.env.local`:

```powershell
WHATSAPP_TEST_AUTO_REPLY_ENABLED=false
```

Redeploy or restart the app after changing it.

On Vercel:

1. Set `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false`.
2. Redeploy the latest deployment so the environment change is active.

## Hard Stop

If you need an immediate hard stop:

1. Close the local app/server window.
2. Remove or disable the webhook URL in Meta dashboard.
   Disable or remove the webhook in Meta if replies must stop at the source.
3. If a token may have been exposed, rotate `WHATSAPP_ACCESS_TOKEN` in Meta.

## Confirm Off

Settings/System Health should show:

- WhatsApp test auto-reply: Disabled by default
- WhatsApp public auto-reply: Disabled
- WhatsApp closed-test posture: gated or disabled

## What Remains Disabled

- Public auto-reply
- WhatsApp blasting
- Calendar booking
- Auto-pricing
- Quote ranges
- Payment collection

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

