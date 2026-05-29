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
