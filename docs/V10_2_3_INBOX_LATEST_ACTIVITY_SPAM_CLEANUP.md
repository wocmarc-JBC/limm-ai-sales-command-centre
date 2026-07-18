# v10.2.3 Inbox Latest Activity & Spam Cleanup

## Outcome

- The WhatsApp client queue is ordered strictly by the newest meaningful inbound or outbound message.
- Status buckets no longer move an older chat above a newer chat.
- The complete eligible lead pool is ordered before the 30-conversation performance limit is applied.
- Boss/admin operators can remove spam directly from a queue row or the active-chat header.
- Spam removal marks the lead as spam, writes the existing audit event, and immediately removes it from the active inbox.
- Spam removal is recoverable from `Leads → Show Spam`; it does not hard-delete the lead, messages, files, or audit history.

## Layout

- Removed the duplicated inbox title inside the panel.
- Context starts collapsed so the active chat has the primary workspace.
- Queue, message timeline, and context use bounded independent scrolling on desktop.
- Search, filters, counters, manual reply, and conversation safety context remain available.

## Safety Boundary

- The single WhatsApp reply planner and merged lead context are unchanged.
- No reply composer, reply fallback, webhook, send payload, price guide, calendar, voice transcription, auth rule, environment variable, or Supabase schema was changed.
- Spam cleanup requires the existing `soft_delete_leads` permission and never calls the hard-delete path.

## Verification

- Pure comparator regression coverage for newest-first, oldest-last, ties, invalid timestamps, and immutability.
- Static live-path checks for ordering before limiting, polling consistency, permission gating, recoverability, and active-chat continuity.
- Browser verification at 1440×1000 for layout bounds, independent scrolling, ordering, controls, confirmation copy, context open/collapse, and console errors.
- Existing intent, conversation safety, concurrency, inbox, lifecycle, send-state, lint, typecheck, audit, and production-build gates remain required.
