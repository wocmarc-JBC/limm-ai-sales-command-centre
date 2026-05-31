# WhatsApp Live Incident Playbook

## First Principle

Do not diagnose live WhatsApp behavior from local PASS alone. Production proof starts with the deployed health endpoint.

Health URL:

`https://limm-ai-sales-command-centre.vercel.app/api/whatsapp/health`

## If WhatsApp Goes Silent

1. Open the health URL.
2. Confirm `version` is the expected deployed version.
3. Confirm live inbound and auto-reply booleans.
4. Check Vercel logs for:
   - `whatsapp_webhook_received_start`
   - `whatsapp_payload_parsed`
   - `whatsapp_inbound_message_saved`
   - `whatsapp_reply_decision_started`
   - `whatsapp_reply_finalized`
   - `whatsapp_auto_reply_sent`
5. Check CRM audit logs for the black box reply trace.
6. If no reply was sent, look for:
   - intentional no-reply reason
   - safety result
   - repetition result
   - quality result
   - no-silence guard result
   - send failure metadata

## Emergency Off

To stop outbound replies:

1. Set `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false`.
2. Redeploy or restart.
3. Confirm health shows outbound auto-reply disabled.

To stop inbound processing:

1. Set `WHATSAPP_LIVE_INBOUND_ENABLED=false`.
2. Redeploy or restart.
3. Remove the webhook URL in Meta if needed.

If a token is exposed, rotate the token immediately.

## Rollback

If v5.3 introduces a production issue:

1. Turn off outbound replies first.
2. Confirm inbound messages still save.
3. Restore the previous known-good commit if needed.
4. Redeploy.
5. Confirm health endpoint version and env booleans.

## Controlled Live Retest

Only after health shows v5.3:

1. `Hi, I want to renovate my landed house.`
2. `can you come up with design theme?`
3. `can make appt for wed 2pm?`
4. `how much roughly?`
5. `are you there?`
6. `hello`
7. `when is next available slot for meeting?`
8. `can you confirm wed 2pm?`
9. `can hack wall?`
10. `need approval?`

Expected:

- every valid text gets a reply
- price gets a safe no-amount reply
- ping/hello gets warm acknowledgement
- appointment gets availability-check wording, not confirmation
- hacking gets caution and no certainty
- approval gets caution and no promise
- audit logs show decision trace
