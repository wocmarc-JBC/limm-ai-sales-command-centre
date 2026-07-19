# Client Files Disaster Recovery

The `client-files` bucket is private and production access uses short-lived signed URLs. Database backups do not include Storage objects, so database PITR alone is not a client-file backup.

## Required production control

- Replicate `client-files` to a separate provider/account at least nightly.
- Encrypt the replica, retain 35 daily versions and 12 monthly versions, and prevent public access.
- Target RPO: 24 hours. Target RTO: 4 hours.
- Store a daily inventory containing storage path, byte size, MIME type and checksum where available.
- Run a monthly restore drill into an isolated bucket; verify a sample image and PDF through the application attachment endpoint.
- Record the backup job ID, copied/failed object counts, manifest checksum and restore-drill evidence in the operations log.
- Alert the boss/admin channel when the most recent successful backup is older than 26 hours or any object fails replication.

## Release gate

Schema, application and browser checks must pass before deployment. A release does not claim disaster-recovery readiness until an independent storage target is configured and its first restore drill passes. Credentials belong in the deployment secret store, never source control.
