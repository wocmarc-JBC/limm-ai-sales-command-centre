# WhatsApp Live Closed Test Setup Guide

Status: v4.8 closed test only.

This guide is for Marcus-only WhatsApp testing before the number is public. Public production auto-reply remains NO-GO.

## 1. Required Meta Values

Get these from Meta WhatsApp Cloud API:

- WhatsApp Verify Token: choose a private random text value.
- WhatsApp Phone Number ID: from the WhatsApp Cloud API phone number screen.
- WhatsApp Access Token: from Meta developer tools or the business system user token.
- WhatsApp Business Number: the business number in international format, for own-number loop protection.

Do not paste tokens into screenshots or ChatGPT.

## 2. Required Supabase Value

Because Meta webhooks arrive without a logged-in boss user, live webhook writes require the existing server-only Supabase service role key in `.env.local`:

```powershell
SUPABASE_SERVICE_ROLE_KEY=
```

This key must stay server-side only. It must never be used in frontend code.

## 3. Closed Test Environment

In `.env.local`, use:

```powershell
WHATSAPP_LIVE_INBOUND_ENABLED=true
WHATSAPP_TEST_AUTO_REPLY_ENABLED=true
WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false
WHATSAPP_TEST_MODE=true
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_BUSINESS_NUMBER=
```

Paste the real values after the `=` signs locally. Do not paste them into docs, screenshots, or chat.

Keep OpenAI optional:

```powershell
OPENAI_BRAIN_DRY_RUN=false
```

If OpenAI dry-run is later enabled, WhatsApp still validates the draft before sending and still uses boss-safe reply rules.

## 4. Apply Migration

Apply this migration in Supabase SQL Editor:

```text
supabase/migrations/018_v4_8_whatsapp_closed_test.sql
```

It adds WhatsApp message metadata, message-id dedupe, and status tracking.

## 5. Webhook URL

Expose the local app with a tunnel or use a deployed URL.

Webhook callback path:

```text
https://YOUR_DOMAIN_OR_TUNNEL/api/whatsapp/webhook
```

In Meta:

1. Open the WhatsApp app webhook settings.
2. Paste the callback URL.
3. Paste the exact `WHATSAPP_VERIFY_TOKEN`.
4. Subscribe to the `messages` webhook field.

## 6. Marcus Test

1. Start the app.
2. Send a WhatsApp message from Marcus's test phone to the test business number.
3. Check the lead detail page.
4. Confirm inbound and outbound messages are saved.
5. Confirm audit log includes WhatsApp inbound and auto-reply events.

## 7. Emergency Off

Immediate kill switch:

```powershell
WHATSAPP_TEST_AUTO_REPLY_ENABLED=false
```

Then restart the app.

Other emergency steps:

- Stop the local server.
- Remove the webhook URL in Meta dashboard.
- Rotate the WhatsApp access token if exposed.

## Safety Posture

- Marcus-only closed test: GO.
- Public auto-reply: NO-GO.
- WhatsApp blasting: NO-GO.
- Calendar booking: NO-GO.
- Auto-pricing or quote ranges: NO-GO.

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

