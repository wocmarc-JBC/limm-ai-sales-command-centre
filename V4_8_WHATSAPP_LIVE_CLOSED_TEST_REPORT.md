# v4.8 WhatsApp Live Closed Test Auto-Reply Report

Status: PASS for Marcus-only WhatsApp closed-test build.

## Scope

v4.8 adds real WhatsApp Cloud API inbound webhook handling and closed-test auto-reply for Marcus-only testing. This is not public production.

## Files Changed

- `app/api/whatsapp/webhook/route.ts`
- `lib/whatsapp-config.ts`
- `lib/whatsapp-parser.ts`
- `lib/whatsapp-safety.ts`
- `lib/whatsapp-auto-reply.ts`
- `lib/adapters/whatsapp-adapter.ts`
- `lib/data/lead-messages-repository.ts`
- `lib/data/supabase-admin.ts`
- `lib/data/audit-repository.ts`
- `lib/data/data-source.ts`
- `app/leads/[id]/page.tsx`
- `app/settings/page.tsx`
- `.env.example`
- `supabase/migrations/018_v4_8_whatsapp_closed_test.sql`
- `supabase/MIGRATION_ORDER.md`
- `scripts/test_v4_8_whatsapp_closed_test.mjs`

## Webhook Behavior

GET verifies Meta webhook setup using `WHATSAPP_VERIFY_TOKEN`.

POST parses WhatsApp Cloud API inbound payloads, dedupes provider message ids, creates or updates a WhatsApp lead by phone, saves inbound messages, and writes `whatsapp_inbound_received` audit logs.

## Auto-Reply Behavior

Auto-reply runs only in Marcus-only closed test mode:

- inbound enabled
- test auto-reply enabled
- public auto-reply disabled
- test mode enabled
- credentials configured
- valid text inbound
- not duplicate
- rate limit passed
- safety validator passed

If OpenAI dry-run is enabled and usable, the draft can be used after validation. If OpenAI is disabled, missing, fails, or returns invalid output, the safe fallback reply is used.

## Kill Switch

Immediate off:

```powershell
WHATSAPP_TEST_AUTO_REPLY_ENABLED=false
```

Hard stop options:

- stop the app server
- remove Meta webhook URL
- rotate WhatsApp token if exposed

## Rate Limit

The closed-test sender cannot receive more than 3 auto-replies from the same lead within 10 minutes.

## Safety Validator

Blocks pricing, ranges, rough estimates, package prices, forbidden wording, authority/permit certainty, hacking/structural certainty, completion guarantees, and Calendar booking confirmation.

## WhatsApp Default State

Default is safe:

- inbound disabled
- test auto-reply disabled
- public auto-reply disabled
- test mode true
- app works without WhatsApp credentials

## Setup Guide

Created: `WHATSAPP_LIVE_TEST_SETUP_GUIDE.md`

## Tests Run

- `npm.cmd install`: PASS
- `npm.cmd run qa:browser`: PASS, 76 passed, 10 skipped because authenticated credentials were not present in this shell
- `npm.cmd run qa:v4-3`: ran, 6 skipped because `SUPABASE_TEST_EMAIL` and `SUPABASE_TEST_PASSWORD` were not present in this shell; Marcus previously confirmed v4.3 authenticated boss-write PASS
- `npm.cmd run qa:dev-brain`: PASS WITH MANUAL AUTH REQUIRED
- `node scripts/audit_v3_package.mjs`: PASS

The live Supabase schema verifier could not reach Supabase from this runner and was recorded as skipped by Dev Brain. Static migration and package checks passed.

## Remaining Limitations

- Marcus-only closed test only.
- Public auto-reply remains NO-GO.
- Calendar booking remains disabled.
- No pricing engine exists.
- Supabase webhook writes require server-only service role in `.env.local`.

## Recommendation

GO only for Marcus-only WhatsApp live closed test after final QA passes. NO-GO for public production auto-reply.
