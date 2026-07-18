# v10.3.0 Inbox Operator Experience

## Outcome

The live WhatsApp inbox is now organised around the operator's two primary jobs: find the right conversation quickly and reply without losing context.

## Changes

- Keeps the conversation queue strictly ordered by latest client activity, newest first.
- Moves the reply composer below the message viewport and keeps it fixed at the bottom of the active chat.
- Collapses quick replies and AI drafting tools until the operator asks for them.
- Simplifies conversation rows to one status signal, one preview, one timestamp, and a visible spam shortcut.
- Opens conversation details in an overlay drawer so the chat never becomes narrower.
- Adds a dedicated mobile flow: conversation queue → active chat → back to queue.
- Gives tablet widths the full application canvas instead of forcing the desktop sidebar.
- Adds WhatsApp Inbox to the mobile navigation.
- Adds boss/admin multi-select spam cleanup with Select all and partial-failure feedback.

## Spam Safety

- Single and bulk cleanup require the existing `soft_delete_leads` permission.
- Bulk requests are deduplicated and capped at 30 conversations.
- Every removed lead uses the existing audited `markLeadAsSpam` repository path.
- No message, file, lead, or audit record is permanently deleted.
- Removed conversations remain recoverable from `Leads → Show Spam`.
- Partial failures are reported without hiding conversations that were not successfully updated.

## Preserved Production Behaviour

- No WhatsApp reply-planner, merged-context, sales-move, direct-question, human-feel, or safety-validator logic changed.
- No webhook, WhatsApp send payload, pricing, calendar, voice transcription, authentication, environment variable, or Supabase schema changed.
- Manual replies continue through the existing replay-safe JSON send endpoint.
- Technical delivery and audit panels remain collapsed and lazy by default.

## Verification Contract

- `npm run test:v10.3.0`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run verify`
- dependency audit and legacy WhatsApp deployment checks
- desktop and mobile Chromium verification, including ordering, sticky composer, overlay drawer, bulk spam cleanup, recovery notice, responsive pane switching, and console/error-overlay checks
