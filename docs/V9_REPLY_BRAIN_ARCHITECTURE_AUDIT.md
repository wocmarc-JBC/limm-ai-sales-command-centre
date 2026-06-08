# v9 Reply Brain Architecture Audit

Status: PASS - v9 clean-core route prepared.

## Current Reply Path Found

Production WhatsApp inbound handling remains:

Meta WhatsApp webhook -> `lib/whatsapp-auto-reply.ts` -> `buildWhatsAppReplyDecision()` -> WhatsApp Cloud API adapter.

The send adapter and known-good payload contract were deliberately not changed.

## Final Reply-Capable Files Audited

- `lib/whatsapp-reply-decision.ts`: production decision wrapper. Before v9 it executed coach, v6, and v7/v8 logic. It now routes to v9 only.
- `lib/whatsapp-v9-sales-brain.ts`: new production reply core.
- `lib/whatsapp-reply-coach.ts`: old coach reply logic. Quarantined from production final replies.
- `lib/whatsapp-sales-brain.ts`: old question-bank-era reply logic. Quarantined from production final replies.
- `lib/whatsapp-v7-sales-brain.ts`: old v7/v8 single planner. Quarantined from production final replies.
- `lib/whatsapp-v6/*`: old v6 meaning/composer/governor layers. Quarantined from production final replies.
- `lib/whatsapp-question-bank.ts`: reference classifier/playbook. Not used as production final reply composer in v9.
- `lib/whatsapp-auto-reply.ts`: production sender and audit path only. It still performs final safety validation before sending.

## Root Cause Of Repeated Live Reply Failures

The old architecture layered several reply systems together. Even after patches, production still imported and executed coach/v6/v7 paths before selecting or rewriting a final reply. That made it possible for legacy wording, stale memory, generic intake, or repeated asks to re-enter the final message.

Live failures linked to this shape included:

- Old price templates surviving after later price-context patches.
- Floor plan and photos being asked for again after the client corrected the bot.
- Frustrated follow-up messages being routed back into generic intake.
- Hypothetical condo/timeline questions being able to pollute the actual landed A&A context.

## v9 Quarantine Decision

v9 keeps old files for reference and historical tests only. Production final replies now enter one core:

`buildWhatsAppReplyDecision()` -> `buildV9WhatsAppSalesBrainDecision()`

The v9 core owns:

- Durable correction memory.
- Frustration handoff lock.
- Direct-question-first routing.
- Hypothetical context switch guard.
- Anti-repeat guard.
- Legacy template blocker.
- Final trace metadata.

## Files Deliberately Not Touched

- WhatsApp webhook verification.
- WhatsApp Cloud API send adapter and payload shape.
- Supabase schema and migrations.
- Auth.
- Dashboard and Singapore map.
- Calendar booking.
- Voice transcription.
- Pricing settings.
- Env files and secrets.

## v9 Acceptance Position

GO only for controlled WhatsApp reply-brain testing after health proves:

- `version: v9_0_clean_whatsapp_sales_brain`
- `salesBrainVersion: v9_clean_core`
- `v9ProductionRouteEnabled: true`
- `legacyReplyLogicQuarantined: true`
- `singleReplyCoreOnly: true`

NO-GO remains for price/range automation, autonomous calendar booking, voice transcription, payment, broadcast messaging, or weakening safety gates.
