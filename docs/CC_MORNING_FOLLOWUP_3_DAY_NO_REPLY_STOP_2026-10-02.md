# CC Morning Follow-up: 3-Day No-Reply Stop

Production change applied on **2026-10-02**.

## Production migration

- Supabase migration: `20261002014832_stop_morning_followups_after_3d_no_reply_until_inbound`
- Production project: `limm-ai-sales-command-centre`

## Required invariant

For automated morning follow-ups:

1. A successful automated follow-up starts a no-reply clock.
2. If no valid inbound WhatsApp message from the client is received for **3 full days (72 hours)** after that successful follow-up, automation for that lead stops.
3. No new morning follow-up may be scheduled while the 3-day no-reply stop is active.
4. Any already-pending follow-up that reaches the send path after the 72-hour ceiling must be expired before provider send.
5. The template-send path is also blocked; an approved template must not bypass this business rule.
6. No retry is created for the 3-day stop.
7. A later valid inbound WhatsApp message from the client clears the stop automatically because it is newer than the prior sent follow-up.
8. After that inbound, a new follow-up cycle may be scheduled if the lead is otherwise eligible.

This is separate from the Meta 24-hour / 131047 hard gate. Both protections remain active.

## Implementation

A protected helper now defines the rule:

- `whatsapp_v16_1_no_reply_3d_blocked(lead_id, company_id, now)`

The rule is enforced at multiple layers:

- morning scheduler: `schedule_whatsapp_v16_1_follow_up`
- worker claim: `claim_whatsapp_v16_1_follow_up_batch`
- free-form final authorization: `authorize_whatsapp_v16_1_follow_up_send`
- template final authorization: `authorize_whatsapp_v16_1_follow_up_template_send`

Pending rows already beyond the 72-hour no-reply ceiling are migrated to:

- status: `EXPIRED`
- cancel reason: `no_reply_3d_stop_until_client_reply`
- retry eligible: `false`
- provider request: none

## Verification

Production rollback-only QA verified:

- existing no-reply lead -> helper returns **blocked=true**
- schedule attempt -> **denied** with `blocked_after_3d_no_reply_until_client_reply`
- simulated later valid client reply -> helper returns **blocked=false**
- schedule after client reply -> **allowed**
- QA transaction rolled back

The existing future follow-up for the tested production lead was correctly cancelled by the migration itself with `provider_status=NOT_CALLED`.

Supabase security/performance advisors were run after the migration. Reported findings are pre-existing project-wide advisories; no new public-access grant was introduced by this change.
