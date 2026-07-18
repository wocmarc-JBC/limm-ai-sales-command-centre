# v10.5.0 Command Centre 10-Quality Pass

## Outcome

This release closes the measurable gaps behind the final product-quality score without changing WhatsApp reply behaviour or production client data.

- Command Core initial JavaScript fell from 354 KB to 104 KB in the production build (about 71% lower).
- The 3.3 MB Singapore planning-area asset now lives behind a deferred interactive-map boundary.
- Every protected route has a real page-level `h1`, a keyboard skip link, and a focusable main landmark.
- The unauthenticated Supabase gate preserves that same heading and skip-navigation contract.
- `Command/Ctrl + K` opens a global, searchable command palette covering the complete operator navigation surface and key actions.
- The command palette traps focus, supports arrows and Enter, closes with Escape, restores focus, and prevents background scrolling.
- Production builds enforce a 120 KB gzip initial-JavaScript budget and a 10 KB route-chunk budget for Command Core.
- Repeated operational signals are deduplicated before rendering, preventing unstable React keys.
- The wide Collection Queue table is contained within its own scroll region instead of widening the application viewport.

## Verification contract

Run:

```bash
npm run verify
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=low
```

Browser verification must cover desktop, tablet, and mobile layouts; command-palette keyboard navigation and focus restoration; semantic heading hierarchy; route overflow; deferred-map loading and interaction; inbox ordering; composer visibility; and recoverable spam cleanup.

## Safety boundary

This release does not change the single reply planner, merged lead context, sales moves, human-feel judge, webhook/send payloads, prices, calendar logic, voice transcription, auth policy, environment variables, Supabase schema, or production client records.
