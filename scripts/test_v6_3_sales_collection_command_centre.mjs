import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const types = read("lib/types.ts");
const salesCollection = read("lib/sales-collection.ts");
const salesRepo = read("lib/data/sales-collection-repository.ts");
const leadsRepo = read("lib/data/leads-repository.ts");
const mapper = read("lib/data/mappers.ts");
const actions = read("lib/actions.ts");
const shell = read("components/ShellChrome.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const pipelinePage = read("app/sales-pipeline/page.tsx");
const collectionPage = read("app/sales-collection/page.tsx");
const targetsPage = read("app/targets/page.tsx");
const reportsPage = read("app/reports/page.tsx");
const quotationPage = read("app/quotation-readiness/page.tsx");
const approvalsPage = read("app/approvals/page.tsx");
const migration = read("supabase/migrations/020_v6_3_sales_collection_command_centre.sql");
const migrationOrder = read("supabase/MIGRATION_ORDER.md");
const packageJson = read("package.json");
const cleanupRules = read("lib/test-lead-cleanup.ts");
const whatsappRoute = read("app/api/whatsapp/webhook/route.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");

for (const phrase of [
  "export type SalesStage",
  "New Lead",
  "Qualified",
  "Quotation Sent",
  "Won",
  "Lost",
  "export type ManualQuotationStatus",
  "ProjectAccount",
  "PaymentRecord",
  "MonthlySalesTarget",
  "potentialValue",
  "quotedAmount",
  "confirmedValue"
]) {
  assert(types.includes(phrase), `v6.3 type coverage missing ${phrase}`);
}

for (const phrase of [
  "salesStages",
  "manualQuotationStatuses",
  "paymentStatuses",
  "nonGstNote",
  "LIMM Works Pte Ltd is not GST-registered. No GST charged.",
  "weightedForecastForLead",
  "buildSalesCollectionSummary",
  "buildQuotationPaymentFollowUps",
  "buildBossMonthlyReport",
  "outstandingForProject",
  "overdueAmountForProject"
]) {
  assert(salesCollection.includes(phrase), `sales collection helper missing ${phrase}`);
}

for (const phrase of [
  "updateLeadSalesTracking",
  "markLeadWon",
  "markLeadLost",
  "lead_sales_tracking_updated",
  "moneyChangeAudit",
  "manualOnly",
  "noPriceGuideAutomation",
  "confirmedValue",
  "wonLostReason"
]) {
  assert(leadsRepo.includes(phrase), `lead sales tracking repository missing ${phrase}`);
}

for (const phrase of [
  "listProjectAccounts",
  "listPaymentRecords",
  "getMonthlySalesTarget",
  "saveMonthlySalesTarget",
  "createProjectFromWonLead",
  "addPaymentRecord",
  "voidPaymentRecord",
  "payment_added",
  "payment_voided",
  "voidInsteadOfDelete",
  "sales_collection_target_changed",
  "project_created_from_lead"
]) {
  assert(salesRepo.includes(phrase), `sales collection repository missing ${phrase}`);
}

for (const phrase of ["mapProjectRow", "mapPaymentRow", "mapMonthlyTargetRow", "sales_stage", "quotation_status", "quoted_amount", "confirmed_value"]) {
  assert(mapper.includes(phrase), `mapper missing ${phrase}`);
}

for (const phrase of [
  "saveMonthlySalesTargetAction",
  "monthly_sales_target",
  "monthly_collection_target",
  "monthly_site_visit_target",
  "monthly_quotation_target",
  "monthly_landed_lead_target",
  "monthly_commercial_lead_target",
  "revalidatePath(\"/targets\")"
]) {
  assert(actions.includes(phrase), `targets server action missing ${phrase}`);
}

for (const phrase of [
  'href: "/sales-pipeline"',
  'href: "/sales-collection"',
  'href: "/targets"',
  "Collection Queue",
  "Money"
]) {
  assert(shell.includes(phrase), `shell navigation missing ${phrase}`);
}

for (const phrase of [
  "Sales Pipeline",
  "Pipeline Value",
  "Weighted Forecast",
  "Potential:",
  "Probability:",
  "Next action:",
  "formatFullPhoneForProtectedApp"
]) {
  assert(pipelinePage.includes(phrase), `sales pipeline page missing ${phrase}`);
}

for (const phrase of [
  "Collection Queue",
  "Manual non-GST tracking",
  "JBC default schedule",
  "LIMM Works custom milestone",
  "Amount due",
  "Due date",
  "Overdue days",
  "Payment milestone",
  "Chase status",
  "Outstanding Receivables",
  "Won Projects",
  "Recent Payments"
]) {
  assert(collectionPage.includes(phrase), `sales collection page missing ${phrase}`);
}

for (const phrase of [
  "Targets",
  "Manual monthly goals",
  "monthly_sales_target",
  "monthly_collection_target",
  "monthly_confirmed_jobs_target",
  "monthly_site_visit_target",
  "monthly_quotation_target",
  "monthly_landed_lead_target",
  "monthly_commercial_lead_target",
  "Save Targets"
]) {
  assert(targetsPage.includes(phrase), `targets page missing ${phrase}`);
}

for (const phrase of [
  "Boss Monthly Report",
  "Confirmed sales",
  "Pipeline value",
  "Weighted forecast",
  "Collections received",
  "Outstanding receivables",
  "Overdue payments",
  "Best lead source",
  "Best project type",
  "Common lost reason",
  "Top follow-up items"
]) {
  assert(reportsPage.includes(phrase), `boss monthly report missing ${phrase}`);
}

for (const phrase of [
  "Quotation Readiness",
  "Ready for Quotation Review",
  "Boss Review Required",
  "QuotationReadinessGateActions"
]) {
  assert(quotationPage.includes(phrase), `quotation review UI missing ${phrase}`);
}

for (const phrase of [
  "Boss Review Gate",
  "Quotation Sent / Quoted",
  "timestamp, user, action, and note"
]) {
  assert(approvalsPage.includes(phrase), `boss review gate UI missing ${phrase}`);
}

for (const phrase of [
  "020_v6_3_sales_collection_command_centre.sql",
  "project_accounts",
  "payment_records",
  "monthly_targets",
  "sales_stage",
  "quotation_status",
  "quoted_amount",
  "confirmed_value",
  "voided_at",
  "enable row level security",
  "payment_records_update_boss_admin",
  "monthly_targets_update_boss_admin"
]) {
  assert(migration.includes(phrase) || migrationOrder.includes(phrase), `migration/order missing ${phrase}`);
}
assert(!/payment_records[\s\S]{0,180}for delete/i.test(migration), "payment records must not have a delete policy; void instead.");

for (const field of [
  'version: "v6_3_sales_collection_command_centre"',
  'salesBrainVersion: "v6.3"',
  "salesPipelineAvailable",
  "manualQuotationTrackingAvailable",
  "monthlySalesTargetsAvailable",
  "monthlyCollectionTargetsAvailable",
  "potentialQuotedConfirmedValuesAvailable",
  "wonLostTrackingAvailable",
  "leadToProjectConversionAvailable",
  "paymentCollectionTrackerAvailable",
  "outstandingReceivablesAvailable",
  "overdueReceivablesAvailable",
  "quotationPaymentFollowUpRemindersAvailable",
  "bossMonthlyReportAvailable",
  "gstCalculationsEnabled: false",
  "taxInvoiceWordingEnabled: false",
  "moneyChangeAuditAvailable",
  "paymentVoidAvailable",
  "priceGuideAutomationEnabled: false",
  "priceGuideOnHold",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled"
]) {
  assert(health.includes(field), `health endpoint missing v6.3 proof field ${field}`);
}

assert(cleanupRules.includes("Marcus") && cleanupRules.includes("Fio") && cleanupRules.includes("Fion"), "Marcus/Fio/Fion cleanup protection must remain.");
assert(whatsappRoute.includes("whatsapp_webhook_received_start") && whatsappRoute.includes("handleWhatsAppInboundMessage"), "WhatsApp webhook must remain preserved.");
for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `known-good WhatsApp payload shape missing ${phrase}`);
}

assert(packageJson.includes('"test:v6.3"'), "package.json must expose v6.3 test script.");
assert(packageJson.includes("test_v6_3_sales_collection_command_centre.mjs"), "package.json must wire v6.3 test script.");
assert(exists("docs/V6_3_SALES_COLLECTION_COMMAND_CENTRE.md"), "v6.3 docs must exist.");
assert(exists("supabase/migrations/020_v6_3_sales_collection_command_centre.sql"), "v6.3 migration must exist.");

const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";
const forbiddenTaxWording = "Tax " + "Invoice";
const checkedSources = [
  types,
  salesCollection,
  salesRepo,
  leadsRepo,
  actions,
  shell,
  health,
  pipelinePage,
  collectionPage,
  targetsPage,
  reportsPage,
  quotationPage,
  migration,
  whatsappRoute,
  whatsappAdapter
].join("\n");

for (const forbidden of [
  wrongWhatsAppPhoneNumberId,
  "free consultation",
  forbiddenTaxWording,
  "rough price",
  "price range",
  "package price",
  "appointment confirmed",
  "booked for you"
]) {
  assert(!checkedSources.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden v6.3 safety regression found: ${forbidden}`);
}

console.log("PASS: v6.3 Sales + Collection Command Centre checks passed.");
