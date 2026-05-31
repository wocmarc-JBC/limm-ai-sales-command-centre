# v5.3 WhatsApp Reply Coach Report

## Status

PASS locally after build, replay test, and package audit.

## Root Cause

The v5.2 silence was caused by a hard auto-reply threshold in `lib/whatsapp-auto-reply.ts`.

After 3 recent outbound WhatsApp auto-replies in 10 minutes, the old code returned `auto_reply_disabled` before loading context, building a reply decision, running safety checks, and sending. That exactly matches the live test: the first 3 messages received replies, then later valid client texts went silent.

## Files Changed

- `lib/whatsapp-auto-reply.ts`
- `lib/whatsapp-reply-coach.ts`
- `lib/whatsapp-reply-decision.ts`
- `app/api/whatsapp/health/route.ts`
- `scripts/test_v5_3_whatsapp_reply_coach_replay.mjs`
- `scripts/audit_v3_package.mjs`
- `scripts/dev_brain_qa.mjs`
- `scripts/generate_chatgpt_handoff_report.mjs`
- `package.json`
- `CURRENT_STATUS.md`
- `NEXT_STEPS_FOR_CHATGPT.md`
- `CHATGPT_HANDOFF_REPORT.md`
- `WHATSAPP_REPLY_COACH_PLAYBOOK.md`
- `WHATSAPP_NO_SILENCE_REPLY_RELIABILITY_RULES.md`
- `WHATSAPP_LIVE_INCIDENT_PLAYBOOK.md`

## What Changed

- Added `buildWhatsAppReplyDecision()` as the central reply decision engine.
- Added a Reply Coach that chooses a sales move and answers the actual client question before asking for the next useful detail.
- Changed the old 3-reply threshold into `whatsapp_rate_limit_warning`; distinct valid text still replies.
- Added no-silence fallback for valid client text.
- Added safety, repetition, and quality rewrite/fallback behavior.
- Added black box reply trace metadata to audit logs.
- Added v5.3 health proof fields.
- Added a lean replay test for the exact live failure sequence.

## Reply Coach Behavior

The Reply Coach handles:

- landed renovation
- design questions
- price pressure
- appointment requests
- appointment follow-ups
- ping/hello messages
- hacking/wall questions
- approval/submission questions
- timeline pressure
- complaint/legal/refund messages

It uses warm, practical WhatsApp wording and keeps replies concise.

## No-Silence Guard

For valid client text, an empty reply is not allowed. If safety, repetition, quality, or another gate fails to produce a reply, the system uses a safe fallback and audits `whatsapp_no_silence_fallback_used`.

Only allowed intentional no-reply cases:

- spam
- unsupported media
- system event
- true duplicate Meta delivery

Short client texts such as `hello`, `are you there`, `?`, and `how much` are valid and must receive a reply when auto-reply is enabled.

## Black Box Reply Trace

Every reply decision records safe metadata:

- inbound text
- normalized text
- detected intent
- conversation stage
- confidence
- selected sales move
- reply source
- final reply text
- safety result
- repetition result
- quality result
- no-silence guard result
- appointment status
- handoff required
- final send result

No secrets, tokens, service role keys, or full raw webhook payloads are recorded.

## Health Proof

Expected deployed health fields:

- `version: v5_3_whatsapp_reply_coach`
- `salesBrainVersion: v5.3`
- `replyCoachAvailable: true`
- `replyDecisionEngineAvailable: true`
- `replyQualityGateAvailable: true`
- `validTextNeverEmptyReplyGuard: true`
- `noSilenceFallbackAvailable: true`
- `safetyRewriteInsteadOfSilence: true`
- `repetitionRewriteInsteadOfSilence: true`
- `answerActualQuestionFirstRule: true`
- `blackBoxReplyRecorderAvailable: true`
- `questionBankAvailable: true`
- `openaiWhatsappReplyEnabled: false`
- `calendarAutoBookingEnabled: false`

## Tests Run

- `npm.cmd run build` - PASS
- `node scripts/test_v5_2_whatsapp_question_bank.mjs` - PASS
- `node scripts/test_v5_3_whatsapp_reply_coach_replay.mjs` - PASS
- `node scripts/audit_v3_package.mjs` - PASS

## Remaining Limitations

- Human takeover lock is planned, not implemented, because the app does not yet have a reliable manual-reply detection signal.
- OpenAI WhatsApp reply remains off by default.
- Calendar auto-booking remains off by default.
- Production PASS still requires Vercel deployment proof via `/api/whatsapp/health`.

## Go / No-Go

GO for controlled live WhatsApp retest after deployed health proves v5.3.

NO-GO for autonomous booking, pricing, payment collection, broadcast, or approval bypass.
