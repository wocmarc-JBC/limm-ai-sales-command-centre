# Production Environment Variables Checklist

Use these in Vercel Project Settings -> Environment Variables.

Do not paste real values into this file.

## Supabase Public Variables

These are allowed in frontend because they are Supabase public project values:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Supabase Server-Only Variable

SERVER ONLY. Never expose to frontend. Never use `NEXT_PUBLIC_`.

```text
SUPABASE_SERVICE_ROLE_KEY=
```

Why it exists: Meta webhooks arrive without a logged-in boss user, so the server-only webhook needs this key to write inbound WhatsApp messages and audit logs through RLS safely.

## WhatsApp Live Variables

Marcus-approved live mode uses public auto-reply enabled with test mode disabled.

```text
WHATSAPP_LIVE_INBOUND_ENABLED=true
WHATSAPP_TEST_AUTO_REPLY_ENABLED=true
WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=true
WHATSAPP_TEST_MODE=false
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_BUSINESS_NUMBER=
WHATSAPP_GRAPH_VERSION=v21.0
```

Important:

- Emergency off remains `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false`.
- Closed test remains available with `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false` and `WHATSAPP_TEST_MODE=true`.
- Any other public/test mode pairing is blocked.

## OpenAI Dry-Run Variables

OpenAI dry-run remains optional and boss-review only.

```text
OPENAI_BRAIN_DRY_RUN=false
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

Only add `OPENAI_API_KEY` if Marcus intentionally wants OpenAI dry-run draft recommendations. It must not create live sending, booking, or pricing.

## Review Route

Keep disabled in production:

```text
NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=false
```

## Final Production Safety Check

- No `.env.local` is committed.
- No service role key appears in browser code.
- No WhatsApp token appears in browser code.
- WhatsApp public auto-reply is Marcus-approved only for this live mode.
- Calendar remains disabled.
- Auto-pricing remains disabled.
