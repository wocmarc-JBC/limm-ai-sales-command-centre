# WhatsApp No-Silence Reply Reliability Rules

## Rule

If inbound WhatsApp text is valid client text and auto-reply is enabled, the final reply text must not be empty.

## Valid Short Client Text

These are valid and must not be treated as spam just because they are short:

- `hello`
- `hi`
- `are you there`
- `?`
- `can reply`
- `any update`
- `when available`
- `how much`

## Allowed Intentional No-Reply Cases

- spam
- unsupported media
- system event
- true duplicate Meta delivery

## What Must Not Cause Silence

- safety validator failure
- repetition check failure
- quality check failure
- appointment pending state
- price pressure
- ping/hello messages
- different client messages arriving close together
- old rate-limit threshold

## Required Fallback

When a valid text path cannot produce a safe reply, use the no-silence fallback:

`Thanks for your message. I'll help route this properly. Could you send your property type, basic renovation scope, and any floor plan or site photos if available? The team can then review the next step for an initial project review.`

## Audit Proof

Every valid inbound text should end with one of:

- `whatsapp_auto_reply_sent`
- `whatsapp_handoff_required` with a safe holding reply
- `whatsapp_auto_reply_intentional_no_reply` only for an allowed reason

The trace must show:

- `whatsapp_reply_decision_started`
- `whatsapp_sales_brain_classified`
- `whatsapp_reply_safety_checked`
- `whatsapp_reply_repetition_checked`
- `whatsapp_reply_quality_checked`
- `whatsapp_no_silence_guard_checked`
- `whatsapp_reply_finalized`

## Emergency Off

To stop outbound WhatsApp replies immediately:

1. Set `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false` in Vercel.
2. Redeploy or restart.
3. Confirm `/api/whatsapp/health` shows `testAutoReplyEnabled: false`.
4. Inbound messages should still save if inbound remains enabled.

If needed, also disable the Meta webhook or rotate the WhatsApp token.
