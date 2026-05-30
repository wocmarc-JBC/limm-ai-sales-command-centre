# WhatsApp Auto-Reply Safety Rules

v4.8 now supports two Marcus-controlled modes:

1. Closed test mode.
2. Marcus-approved live WhatsApp auto-reply mode.

Marcus has approved live auto-reply for the current WhatsApp number. This does not relax safety validation, pricing restrictions, Calendar restrictions, audit logging, or kill switches.

## Auto-Reply Allowed Only When All Are True

- `WHATSAPP_LIVE_INBOUND_ENABLED=true`
- `WHATSAPP_TEST_AUTO_REPLY_ENABLED=true`
- Mode is valid:
  - Closed test: `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false` and `WHATSAPP_TEST_MODE=true`
  - Marcus-approved live: `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=true` and `WHATSAPP_TEST_MODE=false`
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

## Approved Modes

- Closed test remains supported for local/internal testing.
- Marcus-approved live mode is supported when Marcus sets `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=true` and `WHATSAPP_TEST_MODE=false`.
- Any other pairing is blocked as invalid mode.

## Closed-Test Labels

- No Calendar booking
- No pricing
- Marcus-approved live mode or closed test mode

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

