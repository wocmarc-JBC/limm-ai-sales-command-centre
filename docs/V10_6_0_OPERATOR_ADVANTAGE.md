# v10.6.0 Operator Advantage

## Outcome

v10.6.0 turns the Command Centre from a passive dashboard into a faster, safer operator cockpit without changing WhatsApp reply generation, webhook behaviour, pricing, calendar policy, authentication policy, or database schema.

## Live product changes

- Boss Daily Brief now opens with a deterministic **Do this next** queue ranked from persisted CRM facts: Marcus decisions, overdue follow-ups, unanswered questions, human takeover, risk signals, and hot-lead momentum.
- The global command palette includes direct queue views everywhere and context-aware actions inside the live WhatsApp Inbox.
- Every active chat has a compact operator brief covering the known client need, open question, last explicit follow-up commitment, conflicts, next action, and a 60-minute response target.
- Inbox filters add **Response overdue** and support up to five locally saved filter/search views.
- Queue health reports the last successful poll and a visible reconnecting state while leaving the current server snapshot usable.
- Single and bulk spam cleanup offer an immediate, permission-gated undo. Both removal and restoration use existing audited repository operations; neither hard-deletes data.
- Existing strict latest-activity ordering, manual reply review, intent gating, human takeover, and recovery paths remain intact.

## Safety boundaries

- Priority scoring and conversation briefs are read-only and deterministic.
- No operator recommendation sends a WhatsApp message or makes a client promise.
- Context commands only focus/open existing UI, navigate, or invoke an already permission-gated operator action.
- Spam undo is bounded to 30 lead IDs, processed in batches of five, and requires `restore_leads` permission.
- No secrets are exposed and no new environment variables or migrations are required.

## Release gates

- TypeScript and lint checks.
- Deterministic Operator Advantage unit/static suite.
- All earlier v10.2–v10.5 safety and product suites.
- Complete repository verification and dependency audit.
- Production Next.js build.
- Inbox initial-JavaScript budget: 140 KB gzip total and 30 KB gzip route-specific.
- Desktop, tablet, and mobile authenticated browser verification, including command actions, saved views, details focus, spam undo, accessibility, ordering, and console/network errors.

The release is committed, pushed, and deployed only after every gate passes.
