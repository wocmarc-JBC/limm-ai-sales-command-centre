# LIMM WhatsApp Replay Pack Spec

Version: v8.0

Purpose: prove the WhatsApp sales agent can handle realistic LIMM Works conversations before public auto-reply is trusted.

Each replay case contains:

- `id`: stable case id.
- `category`: behaviour category.
- `conversation_id`: grouped conversation memory key.
- `turn_index`: turn number inside the conversation.
- `memory_before`: known lead facts before the client message.
- `client_message`: inbound WhatsApp text.
- `expected_intent`: expected primary intent.
- `expected_sales_move`: expected primary sales move.
- `expected_reply_must_include`: phrases or concepts that must appear.
- `expected_reply_must_not_include`: phrases that must not appear.
- `forbidden_phrases`: hard forbidden phrase list for the case.
- `expected_memory_after`: key memory facts that should remain true.
- `handoff_required`: whether the case should route to Marcus/team.
- `max_questions_allowed`: maximum question marks in the final reply.
- `notes`: short rationale.

Runner behaviour:

1. Loads replay cases.
2. Applies `memory_before` plus previous conversation state.
3. Calls the production `buildWhatsAppReplyDecision()` path without sending WhatsApp.
4. Captures final reply and black-box trace.
5. Validates required includes, must-not-includes, forbidden phrases, handoff, memory, and question count.
6. Writes JSON and Markdown reports under `reports/`.

Public safety:

- Public auto-reply is not recommended until golden and generated replay packs pass.
- No pricing, range, package, rough amount, booking confirmation, approval promise, hacking certainty, or voice transcription is allowed.
