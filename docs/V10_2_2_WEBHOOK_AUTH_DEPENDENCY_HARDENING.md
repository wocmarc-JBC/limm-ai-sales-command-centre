# v10.2.2 — Webhook Authentication and Dependency Hardening

## Outcome

v10.2.2 authenticates every WhatsApp webhook POST before parsing, CRM writes, audit creation, reply planning, or Meta sends. It also moves the application to the patched Next.js 15 and React 19 lines and removes the dependency audit findings present in v10.2.1.

The v10.2.1 intent, conversation concurrency, reply reservation, and sales-composer behavior remains unchanged.

## Live request order

```text
POST /api/whatsapp/webhook
-> capture exact request bytes
-> require WHATSAPP_APP_SECRET
-> validate X-Hub-Signature-256 as HMAC-SHA256
-> compare digests in constant time
-> parse JSON
-> continue through the existing intent/concurrency/reply path
```

Missing, malformed, mismatched, and tampered signatures return safe `401 invalid_webhook_signature` JSON. A missing server secret returns safe `500 webhook_signature_config_error` JSON. Neither response includes a signature, secret, body, phone number, or token.

## Required production secret

Set the Meta app's App Secret as this server-only deployment variable:

```text
WHATSAPP_APP_SECRET=
```

Do not use the webhook Verify Token or WhatsApp access token as the App Secret. Never prefix the variable with `NEXT_PUBLIC_`.

Production is ready only when `/api/whatsapp/health` reports all of the following:

```text
version=v10_2_2_webhook_auth_dependency_hardening
webhookSignatureVerificationAvailable=true
webhookSignatureEnforced=true
hasWhatsappAppSecret=true
whatsappProductionSafetyReady=true
```

## Dependency baseline

- Next.js 15.5.20 resolved from `^15.5.16`.
- React and React DOM 19.2.7 resolved from `^19.2.4`.
- ESLint 9.39.5 and eslint-config-next 15.5.20.
- PostCSS 8.5.15 is pinned and overridden transitively until Next.js stops embedding its older vulnerable pin.
- form-data 4.0.6 is overridden transitively for the OpenAI v4 type dependency.

`npm audit --audit-level=low` must return zero vulnerabilities. Remove either override only after the parent package resolves to a patched dependency and the full build/audit gates pass.

## Verification

```text
npm run test:v10.2.2
npm run typecheck
npm run lint
npm run audit:dependencies
npm run verify
npm run build
```

The focused suite executes the production verifier against valid, missing, malformed, mismatched, Unicode, and tampered payload cases. It also asserts that verification occurs before parsing and that the reply composers remain independent of transport authentication.

## Emergency response and rollback

1. Stop automated sends immediately with `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false` and redeploy.
2. Keep signature enforcement enabled while investigating; do not bypass authentication to restore traffic.
3. Confirm the Meta app and Vercel use the same App Secret. Rotate the App Secret if exposure is suspected.
4. Re-enable automated replies only after health is green and a genuine Meta delivery produces `whatsapp_signature_verified` followed by the normal audit/send markers.

No Supabase migration is required for v10.2.2.
