# Calendar Booking Setup Guide

Status: foundation only. Live Google Calendar booking is disabled by default.

## Current Safe Defaults

- `CALENDAR_BOOKING_ENABLED=false`
- `CALENDAR_BOSS_APPROVAL_REQUIRED=true`
- `CALENDAR_AUTO_BOOKING_ENABLED=false`
- `GOOGLE_CALENDAR_CONNECTED=false`
- `GOOGLE_CALENDAR_ID=`
- `GOOGLE_CALENDAR_TIMEZONE=Asia/Singapore`

Calendar booking disabled by default means the CRM can detect appointment intent and prepare a boss review workflow, but it must not create or confirm a Calendar event.

## What Works Now

- Appointment and site visit intent detection from WhatsApp text.
- Booking readiness checks for property type, scope, address or area, floor plan/site photos, and preferred date/time.
- Lead Detail shows Calendar Foundation, booking readiness, missing booking info, and the safety note: Do not confirm booking until event is created.
- Boss actions can mark ready for appointment review, approve booking workflow, or request more info.
- Audit actions are available for appointment review, missing info, booking approval, Calendar event create request, and Calendar event create failure.

## What Is Not Live Yet

- No real Google Calendar OAuth or service account connection is active.
- No autonomous Calendar booking.
- No fake successful booking.
- No WhatsApp appointment confirmation before a real `calendar_event_id` exists.

## Future Live Setup

1. Create or choose the Google Calendar Marcus wants to use.
2. Decide OAuth or service-account strategy.
3. Add only server-side Calendar credentials in the deployment provider.
4. Set `GOOGLE_CALENDAR_ID`.
5. Set `GOOGLE_CALENDAR_CONNECTED=true` only after the adapter is tested.
6. Keep `CALENDAR_BOSS_APPROVAL_REQUIRED=true`.
7. Keep `CALENDAR_AUTO_BOOKING_ENABLED=false` until Marcus explicitly approves autonomous booking.
8. Test with one internal appointment before any customer-facing booking flow.

Do not confirm booking until event is created.
