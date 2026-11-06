# Owner scheduling draft

No live entrypoint imports this directory. No credentials, channel identifiers or owner phone numbers are embedded in these modules. This is a tested orchestration draft, not an enabled integration.

Read `docs/CC_OWNER_CALENDAR_ASSISTANT_BLUEPRINT.md` before integrating. The available checkout predates the live calendar and tenant implementation. Implement the injected ports using the canonical current code, then attach the dispatcher **after** authenticated Meta parsing and trusted company/channel resolution, **before** any customer ingestion:

```ts
const ownerResult = await dispatchOwnerCommand(verifiedInbound, ports);
if (ownerResult.handled) return; // Durable outbox owns the response. Never send reply here.
const invitationResult = await dispatchClientConfirmation(verifiedInbound, ports);
if (invitationResult.handled) return;
await existingCustomerIngestion(verifiedInbound);
```

Do not construct `signatureVerified`, `companyId` or `channelId` from untrusted client JSON. Use the existing signature verifier and trusted channel/company mapping. Registry/read errors must fail closed and retry durable acceptance rather than sending the owner into sales intake.

`command-parser.ts` supports a deliberately bounded English grammar: explicit `am`/`pm` or 24-hour times; ISO dates, today, tomorrow/tmr or weekday names; a duration in hours/minutes; one action per message. It asks a clarification for ambiguous “next weekday” dates, bare hours, unspecified dates, unsupported date formats, recurrence, timezone changes and multiple mutations. Owner-supplied natural language may later use the current model provider to produce this command contract, but it must go through the same validation and final deterministic executor. No model-generated client prose or direct tool execution is needed.

`engine.ts` supplies owner routing, agenda, free slots, calendar entries/reminders, move/cancel, scoped contact resolution and client invitation acceptance. It does not book with an external dentist/doctor merely by adding a calendar event. Free-slot results are observations, not reservations. Availability must be checked again under the shared live calendar lock when booking. Google writes require actual write scopes and a freshly usable connection, not static env booleans.

The calendar adapter must fully paginate event searches, expand recurrence, include all required availability calendars and existing holds, and apply current booking settings. Personal owner events need their own chosen calendar/configuration rather than silently using LIMM's business calendar. Use Google's valid deterministic custom event ID for create/reconciliation. Send `If-Match` with the selected ETag for move/cancel; a 412 requires re-selection and no automatic destructive retry. Verify response calendar binding, ID, times, status and ETag before committing a success notice. Propagate provider timeouts/errors to reconciliation; never invent a mock event ID.

The store must durably claim command receipts and hold per-invitation locks. A fingerprint mismatch is an error, not a new command. `prepareMutation` writes the intent and mandatory audit before provider I/O. `commit` atomically writes receipt state, reply/client outbox rows and invitation transitions. Each notice ID is unique. PROCESSING receipts and unknown Google/Meta outcomes require reconciliation. Do not reclaim a stale lock and repeat the external action blindly. A marked failure must surface in the protected operator queue; the draft does not assume that queue already exists.

`outbox.ts` separates queued, provider-accepted, delivered and failed. Its live adapter rechecks owner registration, kill switches and all existing recipient policy guards immediately before the actual send. A failed, blocked or unknown-outcome notice gets no automatic morning follow-up or new send. Verified delivery callbacks update the same outbox/message record without reopening recipient eligibility. An async Meta rejection must remain failed. Outbound settings do not clear the October policy block.

Pending offers are not customer leads. Only the exact contact, channel and company can select an offer; offered/expired timestamps use provider event time and current processing time. Bare “yes” cannot choose among multiple slots. Concurrent confirmations use one invitation lock plus the application's calendar resource lock. Ambiguous, declined, expired or unavailable offers never write Google. A handled appointment confirmation cannot also trigger the sales planner.

Runtime integration still requires private persistence, token-vault/Google adapters, trusted dispatch wiring, authenticated diagnostics, operational review/reconciliation, live OAuth consent and the canonical preview/promotion guard. Those tasks are explicit prerequisites, not implemented by fake or memory-only production adapters in this draft.

Run the draft's executable regression suite with `node scripts/test_owner_calendar_assistant.mjs`. Existing `npm test`, sales replay, webhook-signature, WhatsApp payload and follow-up policy suites remain required for canonical release.
