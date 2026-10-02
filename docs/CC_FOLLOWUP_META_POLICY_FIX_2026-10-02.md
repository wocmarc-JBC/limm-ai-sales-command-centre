# CC follow-up Meta policy stop — production fix

Applied production migration:
`20261002153535_followup_policy_delivery_block_until_valid_inbound`.

## Root cause

The earlier stop checked follow-up rows marked BLOCKED_WHATSAPP_POLICY. Existing
131047 errors on message rows were invisible to that check. Separately, the actual
recent morning-template failures were asynchronous 131049 rejections: message
delivery became failed, but ten linked follow-ups remained SENT. Subsequent cycles
could therefore treat a rejected recipient as eligible.

## Enforced behavior

- Read actual Meta policy rejection history from both messages and follow-ups.
- Enforce the same stop in scheduling, claiming, both final send authorizations,
  the generic outbound guard, and follow-up INSERT/UPDATE control.
- Reconcile failed delivery on message INSERT and UPDATE, including callbacks
  arriving after the worker has completed a follow-up.
- Stop retry and template-retry fields and clear outstanding leases.
- Preserve the original attempt cutoff when suppressing another pending row.
- Only a later valid client inbound message reopens eligibility. Prefer the
  provider event timestamp so receipt-time replays do not reopen the stop.
- Manual outbound success, template approval and elapsed time do not clear it.
- Preserve the separate 72-hour no-reply stop, including template sends.
- Cover Meta recipient-policy errors 131047, 131049 and 130472.

## Production evidence

The original historical-message bypass was reproduced in PostgreSQL before the
patch. The same 100 assertions then passed in local PostgreSQL and against the
production functions in a rollback-only subtransaction. Tests use the actual
delivery-status RPC, asynchronous failure reconciliation, synchronous failure
recording, retry mutations, both final send paths, stale/invalid inbound events,
idempotency, tenant scope, genuine reply reopening and the exact 72-hour boundary.

After migration:

- 10 rejected follow-ups corrected; no linked policy-rejected message remains SENT.
- 17 existing contacts have active Meta policy blocks.
- All 17 deny automated sends when called as the actual service_role.
- 0 pending follow-ups, 0 synthetic QA rows, 0 QA provider calls.
- Counts remain 203 leads, 1,266 messages and 61 follow-up rows after rollback QA.
- The running production app's WhatsApp health endpoint responds HTTP 200.
- New helpers and the new trigger function are SECURITY INVOKER. Execute is
  restricted to service_role; anon/authenticated cannot call them.
- Supabase advisors were reviewed; no new helper or trigger finding was reported.

This is a production database fix; the running app picks up the replaced RPCs
without rebuilding its older repository application source. Its previous cycle
aggregates represent the historical worker run and were not rewritten.

Exact migration SQL, captured pre-change definitions, the implementation blueprint
and machine-readable verification results are checked into this repository.
The repository's historical migration set predates the production v16 schema;
import that missing history before attempting a clean full migration replay.

## Reproducing the regression tests

The rollback SQL in `scripts/test_followup_policy_rollback.sql` runs against a
database with the deployed schema and patch. It calls no external provider and
rolls back all synthetic rows and associated audit/recovery writes.

For the isolated PostgreSQL replay, install the pinned test runtime outside the
application dependencies:

```sh
npm install --prefix /tmp/cc-pg-test --no-audit --no-fund @electric-sql/pglite@0.5.8
CC_PGLITE_MODULE=/tmp/cc-pg-test/node_modules/@electric-sql/pglite/dist/index.js node scripts/test_followup_policy_postgres.mjs
```

`npm test`, `npm run audit` and the existing follow-up protection test also pass.

## Emergency control and rollback

The existing company runtime control `followups_enabled=false` is the emergency
morning-follow-up kill switch. It is not required for this per-contact fix.
Captured prior functions are in
`docs/production-hotfixes/2026-10-02-followup-policy-baseline.sql`; restoring them
would reintroduce the diagnosed bypass. Corrected delivery failures must not be
changed back to SENT when rolling back code.
