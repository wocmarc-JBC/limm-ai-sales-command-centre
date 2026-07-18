# Meta WhatsApp Webhook Live Setup

Status: Marcus-approved live mode for WhatsApp auto-reply.

## 1. Use The Vercel HTTPS URL

Callback URL format:

```text
https://YOUR-VERCEL-URL/api/whatsapp/webhook
```

Do not use a local tunnel URL for production.

## 2. Verify Token

In Vercel, set:

```text
WHATSAPP_VERIFY_TOKEN=
```

In Meta, paste the exact same value into the webhook Verify Token field.

## 3. POST Signature Secret

In Vercel, set the Meta app's server-only App Secret:

```text
WHATSAPP_APP_SECRET=
```

Do not use the Verify Token or access token here. The webhook rejects every POST whose `X-Hub-Signature-256` does not match the exact raw request body before any CRM write or WhatsApp reply.

## 4. Marcus-Approved Live Mode

Use:

```text
WHATSAPP_LIVE_INBOUND_ENABLED=true
WHATSAPP_TEST_AUTO_REPLY_ENABLED=true
WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=true
WHATSAPP_TEST_MODE=false
```

This enables Marcus-approved live auto-reply for the current WhatsApp number. It remains reply-only, safety-gated, audited, and controlled by the emergency kill switch.

## 5. Subscribe Field

In Meta WhatsApp webhook settings, subscribe to:

```text
messages
```

## 6. Confirm Inbound Logging And Auto-Reply

After the WhatsApp number is registered and Meta webhook verifies:

1. Send one message from Marcus's test phone.
2. Confirm the lead is created/updated in the CRM.
3. Confirm inbound lead message is saved.
4. Confirm audit log includes `whatsapp_inbound_received`.
5. Confirm audit log includes `whatsapp_auto_reply_sent` or an exact blocked/failed reason.

## 7. Closed Test Alternative

Closed test remains supported with:

```text
WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false
WHATSAPP_TEST_MODE=true
```

## 8. Emergency Off

Immediate off:

```text
WHATSAPP_TEST_AUTO_REPLY_ENABLED=false
```

Then redeploy/restart.

If needed:

- Disable webhook in Meta.
- Rotate `WHATSAPP_ACCESS_TOKEN`.

## No-Go Items

- Calendar booking.
- Auto-pricing.
- Quote ranges.
- WhatsApp blasting.
