# v10.4.0 Command Centre Product Polish

## Outcome

v10.4.0 turns the Command Centre into a tighter, more consistent operator product while preserving the production WhatsApp reply path and v10.2 conversation-safety controls.

## Product improvements

- One restrained dark visual system with warmer gold, calmer information colours and stronger text contrast.
- A 224px desktop navigation rail with icons, clearer active state and less competition with the working canvas.
- A 64px production mobile header with a compact account menu.
- A six-item icon-based mobile navigation bar with safe-area support.
- Denser shared page headers and metric cards.
- Global keyboard focus, selection, scrollbar and reduced-motion behaviour.
- Route-level loading skeletons plus designed error and not-found states.

## WhatsApp Inbox improvements

- Strict latest-client-activity ordering remains unchanged.
- The selected queue filter is remembered on the current device.
- Keyboard shortcuts: `/` search, `J/K` navigate, `N` next waiting chat, `R` reply and `D` details.
- The details drawer traps keyboard focus, supports Escape and restores focus when closed.
- Conversation rows, queue controls, message bubbles, empty state and sticky composer use the same visual system.
- Single and bulk spam handling remain permission-gated, audited and recoverable from Leads → Show Spam.

## Safety boundary

This release does not change the WhatsApp reply planner, fallback composition, merged lead context, sales moves, direct-question behaviour, pricing, calendar, voice transcription, webhook route, send payload, authentication policy, environment variables or Supabase schema.

## Release gate

- `npm run lint`
- `npm run typecheck`
- `npm run test:v10.4.0`
- `npm run verify`
- `npm run build`
- Desktop, tablet and mobile browser verification
- Production health and runtime-error verification after deployment
