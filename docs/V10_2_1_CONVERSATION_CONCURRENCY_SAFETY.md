# v10.2.1 — Conversation Concurrency Safety

## Release outcome

v10.2.1 closes the remaining cross-instance race in the v10.2 WhatsApp reply path. History-only deduplication is not sufficient when two Vercel workers read the same conversation before either worker saves its outbound message. The live handler now permits only one worker per lead to plan and reserve a client-facing reply.

## Send barriers

Every eligible automatic reply must pass all of these barriers before the existing WhatsApp Cloud API adapter is called:

1. Atomic database lease for the lead. An active worker always wins over later workers, including direct-question webhooks.
2. A short inbound-burst settle followed by a fresh 10-message context load.
3. Existing intent, reply planning, safety validation, semantic deduplication, and final human-takeover check.
4. Final context reload. A reply planned before a newer inbound message is suppressed as stale.
5. Final semantic duplicate check against the refreshed conversation.
6. Atomic reservation of the normalized reply signature for a rolling 10-minute window. A coarse bucket-backed unique index remains as a second database constraint.
7. Existing Meta send adapter.

Lease or reservation errors fail closed. The raw inbound message remains saved, but no automatic reply is sent. A successful send starts a 30-second conversation cooldown; a direct question can bypass the cooldown only after the active worker has released its lease.
The reservation renews the lease for the external-send boundary so a slow Meta request cannot outlive the worker's ownership window.

## Truth and operator fixes

- Lead facts are extracted only from inbound WhatsApp evidence. AI/system prompts cannot become client facts.
- Additive scope details such as kitchen followed by bathroom are merged rather than reported as conflicts.
- Historical rows without `intent_classified_at` are labelled `Legacy — not yet classified`, never as a genuine lead with 0% confidence.
- Marcus can explicitly classify a legacy conversation from its latest 10-message history. This action persists routing and sends no reply.
- Consecutive identical historical AI sends are collapsed only in the main timeline. The occurrence count is shown, and every raw message and Meta ID remains available in WhatsApp Delivery Details.

## Persistence and rollout

Migration `028_v10_2_1_whatsapp_conversation_concurrency.sql` adds:

- `whatsapp_conversation_reply_leases`
- `whatsapp_reply_reservations`
- atomic acquire, release, and reserve functions restricted to `service_role`

Required production order:

1. Apply migration `027_v10_2_intent_gate_conversation_safety.sql` if it is not already present.
2. Apply migration `028_v10_2_1_whatsapp_conversation_concurrency.sql`.
3. Verify `/api/whatsapp/health` reports `migration027Ready=true`, `migration028Ready=true`, and `whatsappProductionSafetyReady=true`.
4. Deploy v10.2.1 application code.
5. Run one controlled inbound test and confirm one outbound Meta message ID.

Do not deploy the v10.2.1 handler before migration 028. It intentionally suppresses automatic replies when the lease RPC is unavailable.

## Required verification

```bash
npm run test:v10.2.1
npm run typecheck
npm run lint
npm run build
npm run verify
```

The v10.2.1 suite includes the full v10.2 gate suite plus:

- eight-worker single-flight and reservation simulation
- live-path ordering and fail-closed static checks
- migration permissions and uniqueness checks
- historical duplicate display checks
- legacy classification UI checks
- inbound-only lead-fact and additive-scope checks
