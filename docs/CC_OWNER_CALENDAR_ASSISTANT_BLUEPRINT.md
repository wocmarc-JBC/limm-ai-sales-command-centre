# CC owner calendar assistant — implementation draft

Status: implementation draft for integration into the canonical current CC source. Not deployed or enabled. This checkout is older than production; never deploy it over the live app.

## Confirmed live findings (5 October 2026, Singapore)

- CC is served at `https://limm-ai-sales-command-centre.vercel.app` through a gateway. The application deployment behind it is `dpl_3uFx298VcwCJcDqAJAPAZS4afQ4q`.
- The available GitHub source contains v11.4.1 foundations; production contains the later v16 and multitenant/calendar integration. The gateway and application projects are disconnected from GitHub.
- Marcus's verified personal WhatsApp number and the distinct front desk number were recovered from prior records. Register the owner number privately against the correct company and channel; do not recognise an owner by message text, display name, suffix matching or contact name. No personal numbers are embedded in this public draft.
- The LIMM Google booking connection is currently recorded as `error`, with `google_oauth_refresh_failed`. The personal connection is availability-only, with no events-read or events-write grant. The static health booleans currently report booking ready despite this state. Account identifiers remain private.
- Current production AGENTS.md requires `LOCAL SOURCE -> PREVIEW -> TEST -> QA -> vercel promote EXACT TESTED DEPLOYMENT` from the canonical Windows project. Its instruction includes: “never link a recovery/probe source or temporary folder to the real Command Centre Vercel project.” This draft remains unlinked and cannot be promoted.

## Before-code blueprint

The existing customer sales planner remains the single reply planner. There will be no competing sales fallback composer. Ordinary client replies continue using merged lead context and one primary sales move; direct questions remain answer-first, budget statements remain budget facts, serious landed A&A never asks broad “which areas” questions, file questions answer file status first, and internal placeholders never reach customers. Existing human-feel and sales replay checks remain required. The new deterministic appointment notices apply only to explicitly authorised owner requests and their pending client confirmations.

The owner branch must run after Meta signature verification and company/channel resolution, before lead upsert, CRM message ingestion, conversion attribution, sales classification or follow-up scheduling. All messages from a registered owner remain internal even when the assistant is disabled or the text is unsupported. An ordinary customer's message saying “I am Marcus” cannot enter this branch. Unsupported owner messages produce help or one precise clarification.

Calendar, inbound dispatch and private persistence changes are explicitly required by this feature. Reuse the current Google token vault, calendar connections, tenant context, booking locks, audit system and outbound authorisation. Do not replace the webhook's signature check, WhatsApp payload, price guide, transcription or auth. Do not weaken the 2 October Meta-policy and 72-hour no-reply protections.

## Draft implementation

The draft is deliberately independent of outdated v11 adapters. It supplies a deterministic owner command parser, an owner/tenant/channel authentication gate, scheduling orchestration, persistent receipt/outbox contracts, exact contact resolution and a pending-invitation confirmation handler. The dependency interfaces must be wired to current production services in the canonical project.

Owner commands cover agenda, free slots, event creation, rescheduling, cancellation, calendar reminders, direct client notices and choosing an available slot with client confirmation. All dates use Asia/Singapore. Ambiguous time, date, contact or event selection produces a clarification rather than a guessed mutation. No external service appointment is promised merely because a personal calendar entry exists.

Event creation uses a deterministic valid Google event ID; rescheduling/cancellation require the current event ETag. Persist the mutation intent before calling Google. Process each company/channel/provider-message receipt once. A receipt left in PROCESSING requires reconciliation rather than blind replay. Commit the resulting owner reply and any client notice to the durable outbox atomically. The outbox must enforce unique recipient/action keys and consult the existing outbound guard at actual send time, including delayed retries. Queue/provider-accepted/delivered/failed remain distinct.

Invitations offer specific slots without claiming a booking. An offer is scoped to its company, channel, exact contact, command and expiry. Only a fresh authenticated message from that contact can accept it. If multiple offers are active, ask which offer the client means. Check availability again under the shared live booking lock. Create and verify the real Google event before confirming. A refusal, unrelated text or ambiguous selection causes no event mutation.

## Remaining canonical integration

1. Read the complete current AGENTS.md and deployment guards in `C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3`. Integrate these new modules there; never deploy the v11 snapshot.
2. Add private, company/channel-scoped owner registration, command receipts, mutation journal, invitation and outbox records. Use existing repository/RLS conventions and atomic claims. No owner data belongs in customer leads, marketing follow-ups or conversion analytics. Validate anon/staff/other-tenant isolation. Preserve history if the owner number already exists as a test/customer record, but exclude it prospectively and cancel pending automation for that identity.
3. Wire the owner branch before customer ingestion and pending-invitation acceptance before the customer sales planner. A handled confirmation must not also receive a sales reply. Customer appointment replies keep merged project context and one booking move.
4. Reconnect the LIMM calendar and grant the chosen personal calendar events-read/events-write access through Google's normal consent flow. Do not silently expand permissions or write personal events into a business calendar. Register the target and all required availability calendars privately. Use current appointment settings, including configurable Sunday, buffers, notice and daily limits. An explicit owner command supplies owner approval; ordinary customers retain their current approval policy.
5. Implement the injected ports using the existing token vault, Google adapter, tenant services, shared resource lock, audit system and durable outbound worker. Apply ETags for updates, idempotent creation and provider reconciliation. Surface refresh/scope errors truthfully.
6. Add real runtime diagnostics: assistant version; registered-owner/config booleans; separately verified events-read, free/busy and write availability; receipt/outbox schema readiness; first-line/phase logs with opaque IDs only. Never expose numbers, emails, tokens, raw command text or event titles in public diagnostics. Include a dry-run parser endpoint restricted to an authorised boss. Keep the independent assistant kill switch off until these pass.
7. Run owner replay/security/concurrency checks, existing sales replays and follow-up regression tests. Use rollback-only database QA. Verify Google read/freebusy and one marked owner-only canary create/move/cancel, with audit proof and removal of the canary. Send no unsolicited client tests. Verify delivery statuses and retries using a controlled fake provider first.
8. Preview the full current app, pass the canonical deployment guard, then promote the exact tested preview using the tracked wrapper. Verify the live version, real OAuth status and owner isolation before asking Marcus to test.

## Kill switch and rollback

Disable owner-assistant execution independently while retaining owner routing/exclusion. Pending jobs must stop before provider writes or sends. Keep the previous application deployment available. Do not restore earlier follow-up database functions; that would reintroduce the October policy bypass. Do not erase audit or command records on rollback. Reconcile interrupted calendar operations by their deterministic event ID/ETag before any retry.
