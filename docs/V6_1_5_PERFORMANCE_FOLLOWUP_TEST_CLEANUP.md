# v6.1.5 Performance + Follow-Up Button Fix + Live Test Cleanup

Version: `v6_1_5_performance_followup_test_cleanup`

## What Changed

This patch keeps the working WhatsApp/Supabase pipeline intact and focuses only on the live Command Centre pain points:

- Follow-Up Queue pagination and filtering.
- Working Complete / Snooze / No Reply follow-up actions.
- Test lead and test follow-up cleanup from inside the app.
- Test/generated records hidden from operational views by default.
- Cleanup scan moved behind an explicit click so dashboard/settings page loads stay light.

## Why The Queue Lagged

The Follow-Up Queue could render too many rows at once, including generated test follow-ups, completed rows, scheduled rows, and repeated action forms. The main dashboard and Settings page also had cleanup-related scanning paths that could read too much data during normal page loads.

v6.1.5 changes the default operational posture:

- Max 20 follow-ups per page.
- Active real follow-ups only by default.
- Completed follow-ups hidden unless selected.
- Test/generated follow-ups hidden unless `Show Test Follow-Ups` is selected.
- Cleanup scan runs only from `Settings -> Cleanup -> Scan Test Data`.

## Follow-Up Queue Pagination

The queue now supports:

- Active
- Due Today
- Overdue
- Snoozed
- Completed
- Show All
- Show Test Follow-Ups
- Search by client, phone, scope, type, notes, or message
- Load More

The repository fetch is bounded and then filtered with shared cleanup detection, so clear QA/browser/generated records stay out of Marcus's live operating queue by default.

## Button Fix Summary

The follow-up actions now use server-action forms with a small client pending-state button:

- Complete marks the row completed and hides it from Active view.
- Snooze pushes the due date forward and moves the row into Snoozed behavior.
- No Reply marks the follow-up as No Reply without breaking the lead.
- Each action writes an audit entry where the repository can write audit logs.
- The button shows a loading label while submitting.

## Live Test Cleanup Rules

Cleanup now covers both:

- Test leads
- Test follow-ups

Detection catches obvious generated/test records such as:

- `test_only`
- `v3_3_live_test`
- `v4_3_auth_boss_browser_test`
- browser-test/dev-brain/live-test markers
- `Test-only follow-up verification`
- known QA phrases such as `how much ah`, `can make appt wed 2pm?`, `voice test`, and `floor plan test`

The default cleanup action:

- Soft-deletes clear test leads.
- Hides/completes clear test follow-ups.
- Skips uncertain real-looking records.
- Preserves audit logs.

## Marcus/Fio/Fion Protection

Hard rule:

If any protected field contains `Marcus`, `Fio`, or `Fion`, the lead or follow-up is excluded completely.
This is the Marcus/Fio/Fion protection rule for both test leads and test follow-ups.

Protected evidence includes:

- Lead name / display name / contact name
- Phone label / CRM title
- Lead messages / summaries / metadata
- Follow-up notes / suggested message
- Attached parent lead fields

No cleanup action, soft delete, or hard delete should touch protected records.

## Cleanup Flow

1. Open `Settings`.
2. Go to `Cleanup`.
3. Click `Scan Test Data`.
4. Review dry-run counts and samples.
5. Use `Soft Delete Test Leads + Test Follow-Ups` for the normal cleanup.
6. Use `Hide / Complete Test Follow-Ups` if only follow-ups need cleaning.
7. Use the Danger Zone only for already-soft-deleted test leads.

Cleanup scan does not run on normal page load.

## Live Retest Checklist

1. Open Follow-Up Queue.
2. Confirm test-only and v3/v4/v5/v6 browser-test rows are hidden by default.
3. Confirm max 20 active rows/cards are visible.
4. Click Complete and confirm row updates/disappears.
5. Click Snooze and confirm row updates.
6. Click No Reply and confirm row updates.
7. Open Settings -> Cleanup.
8. Run Scan Test Data.
9. Confirm Marcus/Fio/Fion protected count is shown when relevant.
10. Apply soft cleanup only after reviewing dry-run samples.
11. Confirm Dashboard, Follow-Up Queue, AI Lead Inbox, and Reports stay clean by default.
12. Confirm WhatsApp still replies after deploy.

## Rollback Plan

If follow-up actions or cleanup behave unexpectedly:

- Set no new env flags; this patch has no integration enablement switch.
- Do not use hard delete.
- Stop after dry run if counts look wrong.
- Revert the v6.1.5 commit and redeploy.
- Preserve audit logs.

## Safety Status

- WhatsApp payload contract unchanged.
- Price guide remains on hold.
- Calendar auto-booking remains off.
- Voice transcription remains disabled.
- LIMM Works is not GST registered.
- No GST calculation or Tax Invoice wording added.
- No secrets or live tokens are stored in this document.
