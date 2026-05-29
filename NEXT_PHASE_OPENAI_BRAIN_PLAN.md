# Next Phase OpenAI Brain Plan

The OpenAI brain is still disabled in v4.5. The next phase should add it carefully behind dry-run mode, approval gates, and audit logging.

## Goal

Add an internal AI decision brain that can help Marcus classify leads, draft safe replies, recommend next best action, and prepare quotation readiness notes without auto-sending messages.

## Non-Negotiable Safety

- No auto-send at launch.
- No WhatsApp blasting.
- No auto-pricing.
- No quote ranges.
- No rough estimates.
- No authority approval promises.
- No exact timeline promises.
- No final structural, legal, or submission advice.
- Risky cases require Marcus approval.
- All AI decisions and reply drafts must be logged.

## Phase 1 - Dry-Run AI Adapter

- Add OpenAI adapter behind an explicit disabled-by-default flag.
- Keep the current rule-based fallback.
- Return structured JSON only.
- Store AI decisions in `lead_ai_decisions`.
- Show AI output inside the command centre for Marcus review.
- Do not send replies anywhere.

## Phase 2 - Safety Checker

- Add a reply safety checker before any draft can be approved.
- Block pricing, unsafe promises, backend wording, and forbidden wording.
- Require boss approval for risky categories.
- Log blocked drafts and rewrite attempts.

## Phase 3 - Boss Approval Workflow

- AI drafts appear in the Boss Approval Queue.
- Marcus can approve, reject, or request more information.
- Approved drafts still do not auto-send until the later WhatsApp phase.
- Every decision writes audit logs.

## Phase 4 - Controlled Live Reply Preparation

- Connect WhatsApp only after the AI brain passes dry-run QA.
- Keep reply-only handling.
- Keep live auto-send off by default.
- Start with preview-only replies.
- Add rate limits and emergency stop controls.

## Phase 5 - Continuous QA

- Add golden sales conversation tests.
- Add risky-case tests.
- Add no-pricing tests.
- Add Sunday appointment tests.
- Add audit log tests.
- Add Marcus feedback review loop.

## Recommended Next Codex Task

Build v4.6 OpenAI Brain Dry-Run Adapter:

- no live sending
- no WhatsApp
- no calendar booking
- no pricing
- structured AI decision schema
- safety checker
- boss approval gate
- audit logging
- full tests and browser QA
