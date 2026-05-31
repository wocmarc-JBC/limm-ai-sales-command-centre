# V5.0 WhatsApp Sales Brain And Calendar Foundation Report

Status: PASS.

## Files Changed

- `lib/whatsapp-sales-brain.ts`
- `lib/whatsapp-auto-reply.ts`
- `lib/whatsapp-safety.ts`
- `lib/openai-whatsapp-config.ts`
- `lib/calendar-config.ts`
- `lib/calendar-booking.ts`
- `lib/adapters/calendar-adapter.ts`
- `lib/data/lead-messages-repository.ts`
- `lib/data/leads-repository.ts`
- `lib/actions.ts`
- `app/api/whatsapp/health/route.ts`
- `app/leads/[id]/page.tsx`
- `components/LeadCard.tsx`
- `app/settings/page.tsx`
- `.env.example`
- `scripts/test_v5_whatsapp_sales_brain_calendar.mjs`
- `scripts/dev_brain_qa.mjs`
- `scripts/audit_v3_package.mjs`
- `CALENDAR_BOOKING_SETUP_GUIDE.md`
- `CALENDAR_BOOKING_SAFETY_RULES.md`

## Current Reply Path Found

Live WhatsApp POST still enters `app/api/whatsapp/webhook/route.ts`, parses Meta payloads, then calls `handleWhatsAppInboundMessage` in `lib/whatsapp-auto-reply.ts`.

The v5 reply path now loads recent lead messages through `listRecentLeadMessagesForWebhook`, builds a structured decision through `buildWhatsAppSalesBrainReply`, validates safety, checks repetition and tone metadata, audits the decision, then sends through the existing WhatsApp Cloud API adapter.

## Current Send Adapter Preserved

Yes. The known-good WhatsApp payload contract is preserved:

- Graph version: `v21.0`
- `messaging_product: "whatsapp"`
- `recipient_type: "individual"`
- digits-only `to`
- `type: "text"`
- `text.preview_url: false`
- `text.body` safe non-empty string

## OpenAI WhatsApp Reply

OpenAI WhatsApp reply is off by default.

To enable controlled testing later:

```env
OPENAI_WHATSAPP_REPLY_ENABLED=true
OPENAI_API_KEY=...
OPENAI_WHATSAPP_MODEL=gpt-4.1-mini
```

If OpenAI is disabled, missing, invalid, unsafe, or times out, fallback templates continue to work. No OpenAI output goes directly to WhatsApp without schema and safety validation.

## Structured Schema Added

Yes. The schema includes intent, property type, scope summary, missing information, risk flags, appointment intent/type, next best action, reply, internal note, confidence, auto-send gate, boss review gate, and safety notes.

## Template Categories Added

The fallback bank includes landed renovation, A&A works, condo renovation, commercial renovation, hacking/demo, carpentry, price question, site visit request, appointment request, floor plan/photos sent, vague enquiry, unsupported media, repeated enquiry, complaint/risk, and unsupported.

## Friendly Care Tone Behavior

Fallback replies now acknowledge the client, explain why floor plan/photos or scope are needed, and avoid cold command-style wording. The tone check blocks overly salesy or fake language and rewrites cold replies through a safe fallback variation.

## Non-Repetition Behavior

The sales brain compares the new reply against the last three outbound WhatsApp replies. Exact or high-similarity repeats trigger a different fallback variation. If a safe non-repeating reply cannot be found, the reply is held for boss review.

## Calendar Default State

- Calendar booking disabled by default.
- Auto booking disabled by default.
- Boss approval required by default.
- Google Calendar not connected by default.

## Boss Approval Workflow

Lead Detail now shows Calendar Foundation controls:

- Mark Ready for Appointment Review
- Approve Booking
- Reject / Need More Info
- Create Calendar Event only when Calendar is enabled and readiness allows it

No Calendar event is faked. Disabled adapter returns disabled status.

## Appointment Readiness Behavior

The booking readiness engine detects appointment/site visit intent, suggested appointment type, missing info, readiness state, and whether a Calendar event can be created. Missing floor plan/photos, address or area, scope, property type, and preferred date/time block booking where relevant.

## Calendar Adapter Behavior

The adapter interface supports future `createEvent`, but the current implementation is disabled and does not fake successful bookings.

Live Google Calendar is not connected yet.

## Safety Validator Result

The validator still blocks pricing, quote ranges, rough estimates, package prices, forbidden consultation wording, approval/permit certainty, completion guarantees, hacking/structural certainty, and Calendar booking confirmation without `calendar_event_id`.

## Audit Metadata Added

WhatsApp auto-reply audit metadata now records:

- reply source
- intent
- property type
- next best action
- appointment intent/type
- booking readiness
- Calendar event id
- confidence
- safety result
- tone result
- repetition result
- template key
- OpenAI enabled/model
- should auto-send
- blocked reason

## UI Improvements

Lead Detail now shows WhatsApp Sales Brain metadata, latest inbound/outbound WhatsApp messages, Calendar Foundation readiness, missing booking info, safety note, and booking action controls.

Lead cards show WhatsApp badge, appointment requested badge, floor plan/photos need, last WhatsApp message preview, and booking readiness.

Settings/System Health shows OpenAI WhatsApp reply brain status and Calendar foundation status.

## Production Diagnostics

Health endpoint preserved: `/api/whatsapp/health`

Debug parse endpoint preserved: `/api/whatsapp/debug-parse`

The health endpoint now includes OpenAI WhatsApp and Calendar booleans only. No secrets are returned.

## Tests Run

- `npm.cmd install` - PASS
- `npm.cmd run build` - PASS
- `npm.cmd run qa:dev-brain` - PASS
- `node scripts/audit_v3_package.mjs` - PASS

Dev Brain note: live Supabase schema verification was skipped in this sandbox because network fetch failed; this is reported as allowed/manual in the generated Dev Brain output. Marcus has already confirmed live Supabase and WhatsApp production proof in the v4.10 PASS record.

## Marcus Post-Deploy Test

After pushing and waiting for Vercel Ready, Marcus should open `/api/whatsapp/health` and send:

- `Hi, I want to renovate my landed house.`
- `How much roughly?`
- `Can come site visit?`
- `I have floor plan.`
- `This is A&A for landed.`

Expected:

- Replies are not identical.
- Replies sound friendly and practical.
- Replies explain why floor plan/photos/scope are needed.
- No pricing.
- No booking confirmation unless event exists.
- No forbidden consultation wording.
- Audit logs show intent, source, safety, tone, repetition, and Calendar status.

## Go / No-Go

GO only for controlled live WhatsApp reply brain testing plus boss-approved Calendar booking foundation.

NO-GO for pricing, autonomous Calendar booking, payment, WhatsApp blasting, broadcast messaging, removing safety gates, or public marketing blast automation.
