# Owner calendar draft verification — 5 October 2026

Status: tested domain/orchestration draft. Not integrated, deployed or enabled. No live success claim.

## Local validation

- `node scripts/test_owner_calendar_assistant.mjs`: **85 scenarios passed** using controlled in-memory ports. Covers exact owner/channel/tenant identity, UTC-to-Singapore dates, ambiguous commands, scope failures, future-time validation, overlap locks, duplicate receipts, mutation journalling, failed provider responses, ETags, contact ambiguity, opt-outs/policy rejection, invitation acceptance/decline/expiry, concurrent confirmations and durable outbox outcome handling.
- Strict TypeScript compilation of all four new modules: passed.
- Full available-checkout `tsc --noEmit`: passed.
- `npm test`: passed.
- `npm run audit`: passed.
- Existing webhook signature suite: 17 checks passed.
- Existing WhatsApp adapter payload shape: passed.
- Existing v5.3 reply-coach replay: 12 cases passed.
- Existing v6 Ultimate deep QA: **231/231 checks passed**.
- Existing `test_follow_up_protection`: passed.
- Diff whitespace check: passed.

The duplicate-confirmation regression proves a replay remains consumed after its invitation changes from PENDING to CONFIRMED or DECLINED. The kill-switch regression proves disabling the assistant while a command waits for the calendar lock prevents the provider mutation. The outbox regression proves an expiry during the final policy lookup prevents a delayed send.

## Scope of this evidence

The available checkout is the older GitHub source, not the current disconnected Windows production source. Its existing checks cannot prove current-production compatibility. No live entrypoint imports the new modules. Existing webhook/customer/follow-up code, production environment, Google permissions, database schema and deployed applications were not modified. The checkout has no production Vercel binding.

The injected Google, registry, persistence and outbound ports are **contracts**, not production adapters. Tests emulate those contracts. Persistent schema/claims, current token-vault integration, real calendar availability, authenticated dispatch wiring, operator reconciliation and actual Meta callback processing still need implementation in the canonical source.

No Google event, appointment or outbound message was created by this test suite. No client was contacted. No production database data was changed. Live acceptance criteria and the required canonical preview/promotion sequence are in `CC_OWNER_CALENDAR_ASSISTANT_BLUEPRINT.md`.
