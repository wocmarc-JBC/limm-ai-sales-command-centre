# WhatsApp Auto-Reply Safety Rules

v4.8 allows Marcus-only closed testing. It does not approve public production auto-reply.

## Auto-Reply Allowed Only When All Are True

- `WHATSAPP_LIVE_INBOUND_ENABLED=true`
- `WHATSAPP_TEST_AUTO_REPLY_ENABLED=true`
- `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false`
- `WHATSAPP_TEST_MODE=true`
- WhatsApp Cloud API credentials exist
- Inbound message is valid text
- Provider message id has not been processed before
- Rate limit passes
- Reply passes the safety validator

## Blocked Content

The validator blocks:

- Pricing amounts
- Quote ranges
- Rough estimates
- Package prices
- Forbidden review wording
- Authority approval promises
- Permit certainty
- Completion guarantees
- Hacking certainty
- Structural certainty
- Calendar booking confirmation
- "we have booked"
- "appointment confirmed"

## Safe Fallback Reply

The fallback reply asks for floor plan or site photos and uses initial project review wording. It does not promise price, approval, hacking feasibility, timeline, or booking.

## Rate Limit

The app must not send more than 3 auto-replies to the same lead within 10 minutes.

## No Public Mode

If `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=true`, v4.8 blocks the closed-test auto-reply path. Public production auto-reply needs a future approval phase.

## Closed-Test Labels

- No Calendar booking
- No pricing
- Marcus-only closed test

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

