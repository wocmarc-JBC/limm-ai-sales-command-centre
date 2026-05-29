# Meta WhatsApp Webhook Live Setup

Status: webhook readiness only. The WhatsApp number is not registered yet, so Meta connection cannot be completed until the number is ready.

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

## 3. First Verification Safety Mode

For first webhook verification, keep:

```text
WHATSAPP_LIVE_INBOUND_ENABLED=true
WHATSAPP_TEST_AUTO_REPLY_ENABLED=false
WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false
WHATSAPP_TEST_MODE=true
```

This allows webhook verification and inbound readiness without sending auto-replies.

## 4. Subscribe Field

In Meta WhatsApp webhook settings, subscribe to:

```text
messages
```

## 5. Confirm Inbound Logging First

After the WhatsApp number is registered and Meta webhook verifies:

1. Send one message from Marcus's test phone.
2. Confirm the lead is created/updated in the CRM.
3. Confirm inbound lead message is saved.
4. Confirm audit log includes `whatsapp_inbound_received`.

## 6. Enable Closed-Test Auto-Reply Only After Inbound Works

Only after inbound logging is confirmed, Marcus may set:

```text
WHATSAPP_TEST_AUTO_REPLY_ENABLED=true
```

Then redeploy/restart.

Do not enable test auto-reply before the first inbound message is confirmed in the CRM.

Keep:

```text
WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false
```

## 7. Emergency Off

Immediate off:

```text
WHATSAPP_TEST_AUTO_REPLY_ENABLED=false
```

Then redeploy/restart.

If needed:

- Disable webhook in Meta.
- Rotate `WHATSAPP_ACCESS_TOKEN`.

## No-Go Items

- Public auto-reply.
- Calendar booking.
- Auto-pricing.
- Quote ranges.
- WhatsApp blasting.
