# v4.9 WhatsApp Adapter 400 Fix Report

Status: PASS.

## Production Problem

Marcus proved direct Meta Graph API sending works with:

- Graph URL: `https://graph.facebook.com/v21.0/1134564529740227/messages`
- Recipient: digits-only Singapore number
- Payload fields: `messaging_product`, `recipient_type`, `to`, `type`, `text.preview_url`, `text.body`

The CRM webhook reached the auto-reply send step but returned:

```text
WhatsApp Cloud API send failed with status 400
```

## Exact Root Cause In Source

The CRM adapter was not locked to the same send contract as Marcus's known-good direct Graph API test:

- The CRM defaulted WhatsApp Graph API to `v20.0`, while Marcus's successful direct test used `v21.0`.
- The adapter accepted the outbound recipient as passed instead of normalizing the final send payload `to` field at the adapter boundary.
- The adapter discarded Meta's 400 response body, so Vercel logs could not show the exact Meta error code/message.

## Adapter Payload Before

The adapter sent a payload with the correct broad fields, but:

- URL default could be `https://graph.facebook.com/v20.0/{phoneNumberId}/messages`.
- `to` was raw from the caller.
- Meta error response body was hidden.

## Adapter Payload After

The adapter now builds this known-good shape:

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "6591184190",
  "type": "text",
  "text": {
    "preview_url": false,
    "body": "LIMM Works test reply: Thanks for reaching out. To review your renovation enquiry properly, could you send your floor plan or site photos if available? We can then arrange an initial project review."
  }
}
```

Implementation details:

- Default Graph API version is now `v21.0`.
- `to` is normalized to digits only inside `buildWhatsAppTextPayload`.
- `WHATSAPP_PHONE_NUMBER_ID` is normalized before URL construction.
- Empty recipients and empty bodies are rejected before send.
- Undefined/null payload fields are not sent.
- Response body is read safely on non-2xx Meta responses.

## Safe Send Logging Added

Before sending, the service logs:

```text
whatsapp_auto_reply_send_payload_summary
```

It logs only:

- `phoneNumberIdPresent`
- `toDigitsLength`
- `bodyLength`
- `hasMessagingProduct`
- `hasRecipientType`
- `hasTextBody`
- `graphVersion`

It does not log the token, full phone number, or full message body.

## Meta Error Body Logging Added

On non-2xx Meta response, the adapter now preserves safe error details:

- HTTP status
- Meta error code
- Meta error message
- Meta error type

The auto-reply service writes these into failure logs and audit metadata without exposing secrets.

## Files Changed

- `lib/adapters/whatsapp-adapter.ts`
- `lib/whatsapp-auto-reply.ts`
- `lib/whatsapp-config.ts`
- `.env.example`
- `PRODUCTION_ENV_VARS_CHECKLIST.md`
- `package.json`
- `scripts/dev_brain_qa.mjs`
- `scripts/audit_v3_package.mjs`
- `scripts/test_whatsapp_adapter_payload_shape.mjs`
- `V4_9_WHATSAPP_ADAPTER_400_FIX_REPORT.md`

## Tests Run

- `node scripts/test_whatsapp_adapter_payload_shape.mjs`: PASS
- `node scripts/test_v4_8_whatsapp_closed_test.mjs`: PASS
- `node scripts/test_v4_8_live_diagnostics_static.mjs`: PASS
- `npm.cmd install`: PASS
- `npm.cmd run build`: PASS
- `npm.cmd run qa:dev-brain`: PASS
- `node scripts/audit_v3_package.mjs`: PASS

Dev Brain browser QA result:

- 76 passed
- 10 skipped because boss test credentials were not present in this runner

## Remaining Safety Rules

Still blocked:

- pricing
- quote ranges
- rough estimates
- package prices
- forbidden consultation wording
- Calendar booking confirmation
- approval promises
- permit certainty
- completion guarantees
- hacking or structural certainty

## Post-Deploy Verification

After redeploy, Marcus should send one WhatsApp message and check Vercel logs for:

- `whatsapp_auto_reply_send_payload_summary`
- `graphVersion: "v21.0"`
- `toDigitsLength: 10` for `6591184190`
- `hasMessagingProduct: true`
- `hasRecipientType: true`
- `hasTextBody: true`
- `whatsapp_auto_reply_sent`

If Meta still rejects, the logs and audit metadata should now show the safe Meta error code/message.
