# v6.3 Sales + Collection Command Centre

Version: `v6_3_sales_collection_command_centre`

## What Changed

v6.3 adds a manual boss-first sales and collection layer on top of the existing WhatsApp CRM:

- Sales Pipeline route for manual sales stages, owners, next actions, probability, potential value, and close dates.
- Sales & Collection route for won projects, payment records, outstanding receivables, overdue payments, and follow-up reminders.
- Targets route for monthly sales, collection, site visit, quotation, landed lead, commercial lead, and confirmed job goals.
- Boss Monthly Report section in Reports.
- Manual quotation tracking inside Quotation Readiness.

## Non-GST Rule

LIMM Works Pte Ltd is not GST-registered. No GST charged.

The v6.3 money fields are internal manual tracking only. They do not create accounting documents, GST calculations, payment collection, or automated quotations.

## Manual Money Fields

The app now separates:

- Potential value: early pipeline tracking.
- Quoted amount: manually entered quotation tracking only.
- Confirmed value: manually entered won-job value.
- Collected amount: payment records entered manually.
- Outstanding and overdue amounts: calculated from confirmed values and manual payment records.

No price guide automation is enabled.

## Sales Stages

Supported stages:

- New Lead
- Qualified
- Info Requested
- Floor Plan / Scope Received
- Initial Project Review
- Site Visit Needed
- Site Visit Booked
- Quotation Needed
- Quotation Sent
- Follow-Up Due
- Negotiation
- Won
- Lost
- Archived

## Quotation Statuses

Manual quotation status options:

- Not Ready
- Ready to Quote
- Preparing
- Sent
- Client Reviewing
- Revision Requested
- Accepted
- Rejected
- Expired

## Collection Tracking

Payment records support deposit, progress, final, and other payment types. Incorrect payment records should be voided with a reason rather than deleted.

Tracked collection states include:

- No Payment Yet
- Deposit Requested
- Deposit Received
- Progress Payment Due
- Progress Payment Received
- Final Payment Due
- Fully Paid
- Overdue
- Disputed

## Audit Rules

Important sales and collection changes write audit logs where possible:

- `lead_sales_tracking_updated`
- `sales_collection_target_changed`
- `project_created_from_lead`
- `payment_added`
- `payment_voided`

Money-change audit metadata is attached to target, lead value, project, and payment actions.

## Safety Boundaries

Still disabled / preserved:

- WhatsApp payload contract remains unchanged.
- OpenAI live sales brain remains off unless explicitly enabled elsewhere.
- Calendar auto-booking remains off.
- Voice transcription remains off.
- Price guide automation remains on hold.
- Client Files remains coming soon only.
- Marcus/Fio/Fion cleanup protection remains active.

## Live Deployment Proof

After deploy, verify:

```text
https://limm-ai-sales-command-centre.vercel.app/api/whatsapp/health
```

Expected key fields:

- `version: v6_3_sales_collection_command_centre`
- `salesBrainVersion: v6.3`
- `salesPipelineAvailable: true`
- `manualQuotationTrackingAvailable: true`
- `monthlySalesTargetsAvailable: true`
- `monthlyCollectionTargetsAvailable: true`
- `paymentCollectionTrackerAvailable: true`
- `outstandingReceivablesAvailable: true`
- `overdueReceivablesAvailable: true`
- `bossMonthlyReportAvailable: true`
- `gstCalculationsEnabled: false`
- `taxInvoiceWordingEnabled: false`
- `priceGuideAutomationEnabled: false`
- `calendarAutoBookingEnabled: false`
- `voiceTranscriptionEnabled: false`

## Rollback

If the deployed UI has a problem, turn off no env flags first because this phase does not add live integrations. Revert to the prior Git commit, redeploy on Vercel, then confirm the health endpoint version.
