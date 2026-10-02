# Follow-up policy stop: implementation blueprint

The live scheduler currently ignores Meta rejection evidence on message rows. A late
delivery callback also leaves the linked follow-up in SENT, including 131049 failures.

Use a single shared database gate, based on actual message and follow-up history, at
scheduling, claiming, both final authorization paths, the generic outbound guard and
the follow-up state trigger. Preserve each original attempt timestamp when propagating
a block. Only a valid client WhatsApp message with a newer provider event timestamp
clears it; receipt-time replays and outbound/manual/template activity do not clear it.

Reconcile asynchronous delivery failures on message INSERT and UPDATE. Correct linked
follow-up delivery state and suppress pending rows, including their leases and template
retries. Reconcile historical failures in the same migration. Keep the 72-hour no-reply
stop and use the same valid-inbound definition for its reset.

The existing single reply planner and merged lead context remain authoritative. No
competing reply composer or fallback is added. Its primary sales move, answer-first
behavior, client-safe summaries, serious landed A&A handling, budget interpretation and
file-status behavior are preserved. This change requires database send gates and
delivery reconciliation; message payload, pricing, calendar, voice, auth and environment
configuration do not require edits.

Replay the failure and state-transition paths in PostgreSQL, then repeat the assertions
against production in a rollback-only subtransaction. Include delayed callbacks, stale
inbound replay, both templates and free-form, retry mutation, idempotency, valid reopen,
tenant isolation, human takeover, spam and the 72-hour boundary. No customer message
or provider call is part of QA.
