# v6.0 Human-Like WhatsApp Sales Brain

Version: `v6_0_human_like_sales_brain`

## Why v6 Was Needed

v5.3.x fixed silence and added media context, but live replies still sounded too generic in some real homeowner conversations.

Bad examples found live:

- `hello...can help me do my kitchen?` received an over-claimed context reply.
- `do kitchen and demo 2 wall can?` received a generic route-style reply instead of understanding that `demo 2 wall` means demolition or hacking of two walls.

v6 upgrades only the reply intelligence layer. It preserves the working production pipe:

Meta WhatsApp -> Vercel webhook -> Supabase lead/message/audit save -> reply decision -> known-good WhatsApp text adapter.

## New Architecture

The v6 pipeline is separated under `lib/whatsapp-v6/`:

- `message-understanding.ts`
- `singapore-renovation-language.ts`
- `context-truth-gate.ts`
- `reply-planner.ts`
- `natural-reply-composer.ts`
- `safety-governor.ts`
- `reply-quality-judge.ts`
- `sales-brain.ts`

Flow:

client message -> understand meaning -> check verified context -> plan answer -> write natural reply -> safety governor -> quality judge -> no-silence guard -> audit/send.

## Context Truth Gate

The Context Truth Gate prevents the bot from pretending it knows or received details.

Rules:

- Never say `we've received X` unless X is verified from the current lead conversation.
- Do not list many received items unless each item is verified.
- If media exists but content is uncertain, say image/file rather than floor plan.
- If unsure, ask with `if available`.
- Do not leak old test context into a live lead reply.

Blocked bad pattern:

`Thanks, we've received the floor plan/image and property type, scope, site photos, preferred appointment time and design references.`

## Singapore Renovation Meaning Brain

The local parser now understands common Singapore homeowner shorthand:

- `demo 2 wall` -> demolition/hacking of two walls
- `do kitchen` -> kitchen renovation works
- `can?` -> feasibility or capability question
- `reno` -> renovation
- `toilet` -> bathroom
- `overlay` -> tile overlay
- `PE` -> professional engineer
- `submission` / `approval` -> authority or submission question
- `appt anot` -> appointment question
- `got photo` -> portfolio/past works question

`demo` is treated as demolition/hacking in renovation context, not a product demo.

## Natural Reply Composer

The composer answers the actual question first, then asks only for missing information.

Example:

Client: `hello...can help me do my kitchen?`

Reply:

`Hi, yes we can help with kitchen renovation. Could you share whether this is for a landed house, condo or commercial unit, and what you're planning to change in the kitchen? If you have a floor plan or photos, you can send them over for an initial project review.`

Client: `do kitchen and demo 2 wall can?`

Reply:

`Yes, we can help review the kitchen renovation and wall demolition scope. For the walls, we'll need to check the floor plan, wall type, site condition and whether any services are inside before advising if they can be hacked. If you can send the floor plan and photos of the walls, the team can review the next step for an initial project review.`

## Optional AI Interpreter / Drafter

AI support is available only as a controlled future path.

Default:

```text
WHATSAPP_AI_SALES_BRAIN_ENABLED=false
WHATSAPP_AI_DRAFT_REPLY_ENABLED=false
```

If enabled later:

- AI must return strict JSON.
- JSON must be schema-validated.
- Safety Governor must run after AI.
- Quality Judge must run after AI.
- AI cannot send directly.
- AI cannot quote pricing, confirm appointments, promise approval, or promise wall hacking feasibility.

The deterministic v6 local brain works without OpenAI.

## Safety Governor

The rule-based Safety Governor blocks or rewrites:

- pricing amounts, ranges, package prices and rough estimates
- appointment confirmation before a real calendar event exists
- approval, permit or submission certainty
- hacking, wall, structural or waterproofing certainty
- fake project photo claims
- forbidden consultation wording

## Reply Quality Judge

The quality judge fails replies that:

- do not answer the actual question
- sound like a generic form
- ask for too much information
- ask for already received information
- over-claim context
- are too long
- use `I'll help route this properly` for normal renovation questions

## Deep QA

Run:

```powershell
node scripts/test_v6_human_like_sales_brain_deep_qa.mjs
```

Report:

`reports/V6_HUMAN_LIKE_SALES_BRAIN_DEEP_QA_REPORT.md`

The QA contains more than 150 checks across homeowner shorthand, kitchen, hacking, price, appointment, portfolio, media context, over-claim prevention, already-sent info, Singlish, Chinese no-silence, voice fallback, escalation and duplicate/spam regressions.

## Email Handoff

Handoff remains server-only and goes to:

`limmwork@gmail.com`

If the provider is missing, handoff is traced as skipped and the app continues safely.

## Deployment Steps

1. Push the v6 commit.
2. Wait for Vercel deployment Ready.
3. Open `/api/whatsapp/health`.
4. Confirm `version: v6_0_human_like_sales_brain`.
5. Only then perform the controlled live retest.

## Rollback

Emergency stop for WhatsApp replies:

```text
WHATSAPP_TEST_AUTO_REPLY_ENABLED=false
```

Redeploy after changing the env var. Inbound logging can remain enabled.

To rollback code, restore the previous Git commit and redeploy.
