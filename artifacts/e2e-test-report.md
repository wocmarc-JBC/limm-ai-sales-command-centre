# E2E Test Report

QA run: QA_RUN_boss_ops_review_expanded
Run target: Local Next.js dev server
Data mode: QA_E2E_MODE mock data / dry-run external actions

## Routes Tested
- /
- /command-core
- /inbox
- /followups
- /appointments
- /sales-pipeline
- /leads
- /quotation-readiness
- /quotations
- /approvals
- /delivery
- /client-files
- /sales-collection
- /targets
- /reports
- /settings
- /install
- /audit-log
- /data-hygiene
- mobile responsive bottom nav
- /manifest.webmanifest
- /api/whatsapp/health

## Buttons Tested
- Create Quotation Package
- Upload Draft Quotation
- Submit Quotation for Boss Review
- Approve Quote
- Mark Quotation Sent
- Mark Quote Accepted
- Need Site Visit First
- Upload revised quotation v2
- Record Deposit Received
- Record progress payment
- Record final payment
- Confirm MCST approval
- Confirm protection arranged
- Request Revision
- Ask For More Info
- Reject / Hold
- Mark Client Rejected
- Data Hygiene preview suspected records
- Soft archive QA/test records
- Restore wrongly flagged data-hygiene record

## Workflows
- PASS: Normal condo quotation accepted creates project/payment schedule (Project/payment schedule appears after manual acceptance.)
- PASS: Do Not Start Gate shows blockers clearly (Condo start blockers are visible after quote acceptance.)
- PASS: Landed/A&A site-visit-first workflow (Risk badge shown; site visit action audited; revised quote manually sent after boss approval.)
- PASS: JBC carpentry 50/40/10 and deposit blocker (Deposit/progress/final milestones created; deposit receipt clears deposit blocker.)
- PASS: Condo MCST/protection start blockers (MCST and protection confirmations update the Do Not Start Gate.)
- PASS: Revision v1 to approved v2 (v1 requested revision; v2 submitted, approved, and manually marked sent.)
- PASS: Client rejected quote creates no project/payment schedule (Manual rejection recorded; collection queue remains clean.)
- PASS: Cannot mark quote sent before boss approval

## Role Tests
- PASS: QA Sales (Approve Quote is disabled.)
- PASS: QA Project (Project persona uses viewer-level permission and cannot approve.)
- PASS: QA Admin (Approve Quote is enabled.)
- PASS: QA Boss (Boss approved a submitted quotation package.)

## Migration Readiness
- 024_quotation_packages.sql is listed in MIGRATION_ORDER.md.
- Local migration DDL includes quotation_packages table, required workflow columns, RLS enablement, and read/write policies.
- Live/staging command added: npm run verify:quotation-migration with SUPABASE_DB_URL or STAGING_SUPABASE_DB_URL.

## External Action Safety
- QA/STAGING banner visible in QA_E2E_MODE.
- WhatsApp health confirms no public auto-reply recommendation, no calendar auto-booking, and no price-guide automation.
- No hard delete action was used during data hygiene cleanup.

## Dirty Data Checks
- Serene-like fake/demo unlinked payment is hidden from Collection Queue by default.
- Dirty QA records are visible in Data Hygiene preview.
- Dirty QA records remain hidden from Boss Daily Brief by default after restore review because they remain marked test/demo.
- Cleanup and restore actions appear in audit log.

## Skipped Tests
- Authenticated live Supabase write/browser specs are skipped unless SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD are provided.
- Live/staging quotation_packages DB verification is skipped unless SUPABASE_DB_URL or STAGING_SUPABASE_DB_URL is provided to npm run verify:quotation-migration.

## Known Limitations
- QA Project persona uses viewer-level permissions in QA_E2E_MODE until a dedicated production project role is added to Supabase role constraints.
- This Playwright suite runs against mock/QA mode by default; staging Supabase schema readiness is covered by npm run verify:quotation-migration when DB URL is supplied.
