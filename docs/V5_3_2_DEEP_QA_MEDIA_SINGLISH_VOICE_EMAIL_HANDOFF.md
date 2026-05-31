# v5.3.2 Deep QA, Media Context, Singlish, Voice Fallback, Email Handoff

Status: internal launch reliability upgrade.

Version target: `v5.3.2_deep_qa_media_singlish_voice_email_handoff`

## What Changed

v5.3.2 adds a strict internal WhatsApp Agent QA harness, improves media context memory, adds voice/audio fallback, understands common Singlish-style enquiries while replying in professional English, and adds server-only email handoff alerts for important lead moments.

The live WhatsApp text send adapter payload remains unchanged.

## Screenshot Bug Root Cause

The live issue happened because WhatsApp image/document captions and filenames were not carried into the CRM message context. An image with caption such as `can give me design ideas?` and filename such as `floorplan.jpg` could be saved as a generic unsupported image marker. The next text reply then had no reliable context that a floor plan-style image had already arrived, so the combined reply could ask for a floor plan again.

## Media / Floor Plan Context Rules

The parser now preserves safe media context:

- caption
- filename
- MIME type
- media id
- voice/audio marker

The context checker treats image/document messages as likely floor plan or drawing context when the caption, filename, or nearby text contains terms such as floor plan, floorplan, layout, drawing, plan, design ideas, design theme, landed, or A&A.

If a floor plan/image is already detected, the reply should say:

`Thanks, we've received the floor plan/image.`

It must not ask for the floor plan again. It may ask only for actually missing details such as site photos, scope, property area/address, or appointment timing.

## Same-Conversation Context

The reply engine uses the current inbound text plus recent saved WhatsApp messages. This lets a text message immediately after an image/document use the media context from the same conversation.

## Voice Message Fallback

Voice and audio messages are not transcribed.

Approved fallback:

`Sorry, we're not able to listen to voice messages here. Could you type the key details instead, such as your property type, renovation scope, and preferred appointment timing for an initial project review?`

No OpenAI, Whisper, or transcription call is used.

## Singlish Understanding / English Reply

The bot recognizes common lead intent in messages such as:

- how much ah
- can make appt anot
- got landed photo
- can hack wall or not
- need approval meh
- reno landed can

Replies remain professional English. The bot must not reply with Singlish markers such as lah, lor, anot, meh, or can can.

## Human Escalation Triggers

The bot marks human follow-up for:

- appointment requests
- floor plan/photo/document received
- voice message received
- price or budget question
- past works or portfolio request
- hacking or approval question
- urgent, call me, start project, paid deposit
- complaint, refund, lawyer, cancel
- low-confidence or high-value multi-intent lead

Simple greetings alone should not email Marcus.

## Email Handoff

Handoff recipient:

`limmwork@gmail.com`

Environment variables:

```text
HANDOFF_EMAIL_ENABLED=false
HANDOFF_EMAIL_TO=limmwork@gmail.com
RESEND_API_KEY=
SMTP_HOST=
```

If email is enabled but the provider is missing, the app records `provider_not_configured` and continues safely. Email sending is server-only and must never expose provider keys to frontend code.

Anti-spam:

- one combined email for multiple triggers in the same decision
- cooldown for the same lead and same trigger reason
- no email for duplicate Meta deliveries
- no email for simple hello-only messages

## Safety Rules

Still blocked:

- pricing, quote ranges, package prices, generated amounts
- appointment confirmation before a real calendar event exists
- approval, permit, completion, hacking, wall, structural, waterproofing certainty
- `free consultation`
- fake project photos or stock images claimed as past work

Use `initial project review`.

## Deep QA

Run:

```powershell
node scripts/test_v5_3_2_deep_whatsapp_agent_qa.mjs
```

The report is written to:

`reports/V5_3_2_DEEP_WHATSAPP_AGENT_QA_REPORT.md`

The QA checks normal text, multi-intent text, image/document floor plan context, already-sent info, price, appointment, portfolio/Instagram, hacking/approval, voice/audio fallback, Singlish, Chinese no-silence, complaints/escalations, duplicate/spam behavior, and banned safety phrases.

## Live Retest Sequence

Only after Vercel health proves v5.3.2:

1. Send floor plan image with caption: `can give me design ideas?`
2. Send:

```text
can make appt for wed 2pm?
can you come up with design theme?
Hi, I want to renovate my landed house.
can hack wall?
need approval?
```

Expected:

- replies
- does not ask for floor plan again
- answers design, appointment, hacking, and approval
- no appointment confirmation
- no hacking/approval certainty
- email handoff sent or safely skipped if provider missing

Also test:

- `how much ah`
- voice message
- `can see your past works?`

## Rollback

Emergency stop for auto-reply:

```text
WHATSAPP_TEST_AUTO_REPLY_ENABLED=false
```

Redeploy after changing the env var. Inbound messages should still save if live inbound remains enabled.

To rollback code, restore the previous Git commit and redeploy.
