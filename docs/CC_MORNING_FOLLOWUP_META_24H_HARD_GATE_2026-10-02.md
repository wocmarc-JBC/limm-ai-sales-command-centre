# CC Morning Follow-up: Meta 24h Hard Gate

Production hotfix applied on **2026-10-02**.

## Production migration

- Supabase migration: `20261002013912_harden_morning_followup_meta_24h_block_until_inbound`
- Production project: `limm-ai-sales-command-centre`

## Required invariant

A normal out-of-window follow-up may still use an approved WhatsApp template.

However, once Meta actually rejects an automated follow-up with WhatsApp policy error **131047** (or the worker classifies the failure as `WHATSAPP_POLICY_BLOCK`):

1. The follow-up becomes `BLOCKED_WHATSAPP_POLICY`.
2. `retry_eligible` is forced to `false`.
3. No retry is scheduled.
4. Future morning cycles for the same lead are refused.
5. Pre-existing scheduled rows for the same lead are suppressed before any provider call.
6. The block remains in force regardless of how many hours or days pass.
7. Only a later valid inbound WhatsApp message from the client clears the block and allows a new follow-up cycle.

Do **not** restore the previous behavior that auto-superseded `WHATSAPP_POLICY_BLOCK` after 24 hours.

## Database defenses

The production migration hardens these database functions:

- `record_whatsapp_v16_1_follow_up_send_failure`
- `schedule_whatsapp_v16_1_follow_up`
- `claim_whatsapp_v16_1_follow_up_batch`
- `cancel_whatsapp_v16_1_follow_ups_for_inbound`
- `reconcile_whatsapp_follow_up_state_from_message`
- `enforce_whatsapp_follow_up_control`

The table trigger also catches status transitions containing Meta error `131047`, so a caller cannot accidentally mark the failure retryable.

## Regression verification

Rollback-only production regression test:

- Meta `131047` -> `BLOCKED_WHATSAPP_POLICY`
- retry scheduled -> **false**
- scheduler while blocked -> **denied** with `blocked_until_client_reply_after_whatsapp_policy`
- later client inbound -> existing block transitions to `CANCELLED_CLIENT_REPLIED`
- scheduler after inbound -> **allowed**
- rollback confirmed the real future scheduled row was unchanged

No WhatsApp provider request was made by the regression test.

## Repository note

The production Supabase migration history is materially ahead of the migration files currently checked into this repository. This hotfix is therefore documented here rather than added as an auto-run migration that would reference production-only schema objects during a clean local migration replay. Reconcile/import the missing production migration history before moving this SQL into `supabase/migrations`.
