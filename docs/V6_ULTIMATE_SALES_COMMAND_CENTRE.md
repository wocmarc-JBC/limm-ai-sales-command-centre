# V6 Ultimate Sales Command Centre

Version: `v6_ultimate_sales_command_centre`

## Why This Was Needed

Live WhatsApp testing showed that the bot could technically reply but still behave too much like a generic form. Two important examples drove this build:

- `hello...can help me do my kitchen?` needed a direct kitchen-renovation answer, not an over-claimed list of received information.
- `do kitchen and demo 2 wall can?` needed Singapore renovation shorthand understanding: kitchen works plus wall demolition/hacking review.

## Architecture

V6 Ultimate keeps the working WhatsApp pipe:

Meta WhatsApp -> Vercel webhook -> Supabase lead/message/audit save -> reply decision -> safety validation -> known-good WhatsApp text adapter.

The WhatsApp text send payload remains unchanged.

## Context Truth Gate

The Context Truth Gate prevents the bot from pretending it received details that are not verified in the lead conversation. It only allows received claims for confirmed information and uses `if available` language for uncertain context.

## Singapore Renovation Meaning Brain

The local parser understands renovation shorthand such as:

- `demo 2 wall` as wall demolition/hacking review
- `reno` as renovation
- `toilet` as bathroom
- `appt anot` as appointment request
- `got photo` as portfolio request
- `how much ah` as price/budget question

Replies remain professional English even when the client uses Singlish.

## Safety Governor

The Safety Governor blocks or rewrites unsafe output. It prevents pricing, quote ranges, rough estimates, package prices, appointment confirmation without a real event, approval promises, wall/hacking certainty, fake project photo claims, and the banned phrase `free consultation`.

## CRM Cleanup

Normal delete is soft delete. Soft-deleted leads are hidden from the active queue and can be restored. Permanent delete is boss/admin guarded, requires prior soft delete, a typed confirmation, a reason, and an audit entry before deletion. Audit logs are not deleted by normal UI.

## Human Takeover

Human takeover pauses the bot for a lead. WhatsApp inbound messages continue to be saved and audited, but auto-reply is skipped until the bot is resumed.

## Email Handoff

Email handoff remains routed to `limmwork@gmail.com` when provider configuration exists. If the provider is missing, handoff is traced and skipped safely.

## Lead Scoring And Mission Queue

The dashboard now groups leads into boss-first mission queues such as Gold Leads, Needs Marcus, Appointment Requests, Floor Plan Received, Price/Budget Questions, Hacking / Approval Risk, Past Works Requested, Voice Message Received, Follow-Up Due, and Test/Spam Cleanup.

## Settings And QA Centre

The Settings page exposes operational status and a read-only QA centre with safe CLI commands. Browser-triggered script execution is intentionally not exposed.

## Gold Command Centre UI

The UI uses a dark brown / near-black base with gold, yellow, and bronze highlights. It is intended to feel like a luxury command centre, not a cartoon or casino interface.

## Sales Learning Foundation

Lead levels, mission categories, conversation summaries, follow-up reminders, and readiness statuses provide the foundation for future weekly boss reports and learning loops. Weekly reports are draft-only unless email sending is explicitly configured later.

## Quotation And Site Visit Readiness

Readiness remains non-pricing. It checks property type, address/area, floor plan, site photos, scope, risk, appointment interest, and missing information.

## Environment Variables

Key safe defaults:

```env
WHATSAPP_AI_SALES_BRAIN_ENABLED=false
WHATSAPP_AI_DRAFT_REPLY_ENABLED=false
CALENDAR_AUTO_BOOKING_ENABLED=false
V6_ULTIMATE_QA_CENTRE_ENABLED=true
LEAD_SCORING_ENABLED=true
GOLD_COMMAND_CENTRE_UI_ENABLED=true
```

## Deployment Steps

1. Push the v6 Ultimate commit.
2. Wait for Vercel Ready.
3. Open `/api/whatsapp/health`.
4. Confirm `version: v6_ultimate_sales_command_centre`.
5. Run controlled live WhatsApp retest.
6. Apply migration `019_v6_ultimate_command_centre.sql` before relying on persistent cleanup/bot pause fields in live Supabase.

## Rollback

1. Set `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false`.
2. Redeploy/restart.
3. Confirm health endpoint still works.
4. Revert to the last known-good commit if needed.
5. Do not delete audit logs.
