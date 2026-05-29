# Open Issues

## v4.4 Verification Still Required In Marcus PowerShell

- Run `npm.cmd run qa:browser`.
- Run `npm.cmd run qa:v4-3`.
- Run `npm.cmd run qa:dev-brain`.
- Run `node scripts/audit_v3_package.mjs`.
- Confirm `/review-chatgpt-ui` is unavailable by default.
- Confirm `/review-chatgpt-ui` can still be used locally only when `NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=true`.

## Internal Launch Blockers

- Final v4.4 browser rerun is still required in Marcus PowerShell.
- Backups and monitoring are still required before any public production launch.
- Real storage/upload hardening is still required before using real client files.
- Live external integrations remain disabled until Marcus approves a later integration phase.

## Existing Product Limits

- No live OpenAI decision engine yet.
- No live WhatsApp webhook integration yet.
- No real Google Calendar sync or double-booking prevention yet.
- Review UI is development-only and must stay disabled in production.

## Business-Rule Risks To Keep Guarded

- Live AI replies must pass approval gates before any client message is sent.
- Risky landed A&A, authority, structural, complaint, refund, and legal topics must route to Marcus approval.
- Sunday booking must remain configurable through settings.
- Renovation pricing must remain boss-approved and never auto-generated.
