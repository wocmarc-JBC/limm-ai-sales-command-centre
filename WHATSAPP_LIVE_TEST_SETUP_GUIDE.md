# WhatsApp Live Setup Guide

Status: v5.0 controlled WhatsApp Sales Brain testing.

Marcus has approved live auto-reply for the current WhatsApp number. The live path is confirmed working: inbound WhatsApp received, lead created, audit logs written, and WhatsApp auto-reply sent successfully. This remains reply-only, safety-gated, audited, and kill-switch controlled.

v5.0 keeps the known-good live send adapter and adds a smarter reply brain:

- OpenAI WhatsApp reply is off by default.
- Fallback replies still work without OpenAI.
- Replies are less repetitive by template variation and repetition checks.
- Replies use initial project review wording.
- Calendar booking disabled by default.
- Boss approval required for booking workflow.
- Do not confirm booking until event is created.

## 0. Confirmed Working Live Configuration

```powershell
WHATSAPP_LIVE_INBOUND_ENABLED=true
WHATSAPP_TEST_AUTO_REPLY_ENABLED=true
WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=true
WHATSAPP_TEST_MODE=false
SUPABASE_SERVICE_ROLE_KEY=<present server-side>
WHATSAPP_PHONE_NUMBER_ID=<registered phone number ID>
WHATSAPP_ACCESS_TOKEN=<valid token>
WHATSAPP_BUSINESS_NUMBER=<present>
```

Health endpoint must pass:

```text
/api/whatsapp/health
```

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

## 3. Supported Environment Modes

### Closed Test Mode

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

### Marcus-Approved Live Mode

Use this mode only after Marcus explicitly approves live WhatsApp auto-reply:

```powershell
WHATSAPP_LIVE_INBOUND_ENABLED=true
WHATSAPP_TEST_AUTO_REPLY_ENABLED=true
WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=true
WHATSAPP_TEST_MODE=false
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_BUSINESS_NUMBER=
```

Paste the real values after the `=` signs locally. Do not paste them into docs, screenshots, or chat.

Keep OpenAI optional:

```powershell
OPENAI_BRAIN_DRY_RUN=false
OPENAI_WHATSAPP_REPLY_ENABLED=false
OPENAI_WHATSAPP_MODEL=gpt-4.1-mini
```

If OpenAI WhatsApp reply is later enabled, WhatsApp still validates structured JSON before sending and still uses boss-safe reply rules.

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

Confirmed PASS events:

- `whatsapp_inbound_received`
- `whatsapp_auto_reply_requested`
- `whatsapp_auto_reply_sent`

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

- Closed test mode: GO.
- Marcus-approved live auto-reply mode: PASS for current live number.
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

