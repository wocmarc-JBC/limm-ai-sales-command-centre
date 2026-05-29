# Backup And Recovery Guide

## Export Basics

Mock export:

```powershell
npm run export:mock
```

This creates CSV files in `exports/` for leads, follow-ups, and audit logs using demo data only.

## Live Data Export Plan

For live Supabase data, use the Supabase dashboard or CLI export tools. Do not place the service role key in frontend code.

Recommended live exports:

- Leads CSV
- Follow-ups CSV
- Audit logs CSV
- Appointment rules JSON
- Approval requests CSV

## Supabase Backup Instructions

1. Open Supabase project dashboard.
2. Go to Project Settings.
3. Review database backup settings for the plan.
4. Before major changes, export tables or create a database backup.
5. Store backup files in Marcus-approved secure storage.

## Rollback Instructions

1. Stop the app.
2. Do not run new migrations.
3. Restore database backup from Supabase.
4. Revert the deployment to the previous known-good app version.
5. Run `npm run doctor` and `npm run verify`.
6. Confirm audit logs and appointment settings load.

## Recovery Checklist

- Confirm login works.
- Confirm Marcus boss role exists.
- Confirm leads load.
- Confirm appointment settings load.
- Confirm audit logs load.
- Confirm no automatic amounts are generated.
- Confirm OpenAI, WhatsApp, and Calendar remain disabled until intentionally enabled.
