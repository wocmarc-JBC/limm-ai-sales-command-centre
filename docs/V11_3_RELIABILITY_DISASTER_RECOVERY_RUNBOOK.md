# v11.3 Reliability and Disaster-Recovery Runbook

## Production objectives

| Asset / flow | Objective | Evidence | Ready condition |
|---|---:|---|---|
| Accepted WhatsApp inbound | RPO 0 seconds after durable HTTP acceptance | `whatsapp_inbound_jobs` row keyed by provider message ID | Webhook returns 200 only after insert succeeds |
| WhatsApp processing recovery | RTO under 2 minutes | Supabase Cron dispatch + worker heartbeat + attempt rows | Latest successful worker heartbeat is under 3 minutes old |
| Client files | RPO 24 hours, RTO 4 hours | offsite manifest + isolated restore drill | latest backup and restore drill both succeed |
| PostgreSQL business data | RPO 24 hours, RTO 4 hours | provider backup/PITR or independent logical dump and timed restore | backup plan configured and a restore drill passes |
| Application code/config | RPO at last pushed release | public main commit, migrations, Vercel immutable deployment | release commit and deployment ID recorded |

## Durable inbound state machine

1. Meta signature is verified against the raw request body.
2. Parsed messages are inserted idempotently into `whatsapp_inbound_jobs` before HTTP 200.
3. The immediate `after()` worker remains the fastest path.
4. Supabase Cron invokes the same worker every minute using a 256-bit token stored in Vault.
5. Claims use `FOR UPDATE SKIP LOCKED`. A `processing` lease older than five minutes is reclaimable after a crashed worker.
6. Each attempt is recorded in `whatsapp_inbound_job_attempts`.
7. Retry delays are exponential and capped at five minutes. Eight failed attempts create a terminal dead letter.
8. Boss replay expands the attempt budget by eight and reuses the same provider message ID. The existing inbound dedupe and reply-reservation guards remain authoritative.

The scheduler does not call a second reply planner. `handleWhatsAppInboundMessage` remains the only handler and the existing single reply planner remains the only composer.

## Scheduler secrets

The following values are stored only in Supabase Vault:

```text
limm_whatsapp_worker_token
limm_whatsapp_worker_url
limm_client_file_integrity_url
```

The token is generated inside Postgres and is never returned by setup SQL. `verify_limm_scheduler_token` compares token digests and is executable only by `service_role`. The application continues to accept Vercel's `CRON_SECRET` for native daily cron as a second scheduler path.

Expected Cron jobs:

```text
limm-whatsapp-worker-every-minute   * * * * *
limm-client-file-integrity-nightly  10 18 * * *
limm-reliability-retention          40 19 * * *
```

## Queue incident procedure

1. Open Operations → Recovery control plane.
2. Check worker heartbeat, queued age, stale leases and dead-letter count.
3. If heartbeat is stale, inspect `reliability_dispatches`, `cron.job_run_details`, `net._http_response`, and Vercel runtime errors.
4. If a job is terminal, inspect its safe error code and upstream dependency health.
5. Correct the dependency or schema issue, then use **Requeue safely** once.
6. Confirm a completed attempt, a cleared dead letter, and no duplicate client reply.
7. Record the incident, impact window and recovery time in the audit log.

## Client-file recovery procedure

1. Run **Verify checksums**. Stop if any source object is missing or mismatched.
2. Run the offsite backup and confirm all source objects are protected with a manifest checksum.
3. Run an isolated restore drill and confirm image/PDF samples match their expected checksums.
4. For a real restore, read the selected retained manifest, fetch each content-addressed object, verify checksum before upload, and recreate the exact private source path.
5. Keep the bot/manual file UI read-only during a bulk restore; reopen only after a full source-integrity run succeeds.

## Database disaster recovery

The Supabase organization is currently on the Free plan, which does not include automatic backups. v11.3 must not claim database DR readiness from schema migrations or same-project tables. Choose one production control:

- upgrade to a Supabase plan with daily backups and regularly perform a restore-to-new-project drill; or
- run a scheduled encrypted `pg_dump` to an independent private target and test a restore to an isolated Postgres instance.

Supabase documents that database restore/cloning does not copy Storage objects. Client-file replication remains mandatory even when database backups or PITR are enabled.

## Cadence and alerts

- Every minute: durable worker dispatch.
- Nightly: source file integrity.
- Nightly after target activation: offsite file backup.
- Monthly: isolated restore drill.
- Daily: prune completed jobs after 30 days, dead letters after 90 days, dispatch evidence after 30 days.
- Alert when the worker heartbeat is older than 3 minutes, oldest queued job is older than 2 minutes, any stale lease exists, any dead letter exists, source integrity fails, backup age exceeds 26 hours, or restore drill age exceeds 35 days.

## Release and rollback gate

Before production promotion:

1. Migration, RLS/security advisors and failure-injection SQL pass.
2. `npm run test:v11.3.0`, lint, typecheck, full verify and build pass.
3. Preview or production smoke proves unauthenticated scheduler calls are rejected.
4. Production proves a Vault-authenticated dispatch, fresh worker heartbeat and zero stuck jobs.
5. Rollback never drops queue/attempt/recovery evidence. Repoint Vercel to the previous immutable deployment while the database additions remain backward compatible.

References: [Supabase Cron](https://supabase.com/docs/guides/cron), [Scheduling functions with Vault](https://supabase.com/docs/guides/functions/schedule-functions), [Supabase backups](https://supabase.com/docs/guides/platform/backups), [restore-to-new-project limitations](https://supabase.com/docs/guides/platform/clone-project).
