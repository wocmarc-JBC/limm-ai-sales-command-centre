# Calendar Booking Safety Rules

Calendar booking is a boss-approved foundation only.

## Non-Negotiable Rules

- Calendar booking disabled by default.
- Auto booking disabled by default.
- Boss approval required by default.
- Do not confirm booking until event is created.
- Do not say appointment confirmed, booked, see you tomorrow, or we have booked unless a real Calendar event exists.
- Do not promise exact timing until availability is checked.
- Do not promise authority approval, permit certainty, structural certainty, or completion guarantee.
- Sunday remains configurable through appointment settings. Do not hardcode Sunday blocked.

## Appointment Readiness

A lead should not move beyond booking review until the CRM has enough information:

- Client phone or contact.
- Property type if known.
- Basic scope.
- Address or area for site visit.
- Floor plan or site photos for site visit, landed A&A, and commercial renovation review where needed.
- Preferred date/time if the client suggested one.
- Appointment type.

Readiness states:

- `not_ready`
- `needs_info`
- `ready_for_boss_review`
- `approved_for_booking`
- `booked`
- `declined`
- `reschedule_required`

## WhatsApp Reply Safety

If a client asks for a site visit, the safe auto-reply may ask for floor plan, site photos, property area/address, and preferred timing. It must not confirm a slot.

If event creation fails, the system must not send booking confirmation. It should audit the failure and require Marcus action.

## Audit Actions

Important booking workflow actions must create audit logs:

- `appointment_review_requested`
- `appointment_missing_info_requested`
- `appointment_booking_approved`
- `appointment_booking_rejected`
- `calendar_event_create_requested`
- `calendar_event_created`
- `calendar_event_create_failed`
