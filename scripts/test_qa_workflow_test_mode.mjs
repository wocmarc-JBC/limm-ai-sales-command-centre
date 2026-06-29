import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const qaHelper = read("lib/qa-workflow-test-mode.ts");
for (const phrase of [
  "isClearlyQaWorkflowLead",
  "getQaWorkflowTestEligibility",
  "input.role === \"boss\" || input.role === \"admin\"",
  "startsWithQaPrefix",
  "sourceHasQa",
  "isProductionHiddenLead",
  "noWhatsAppSend",
  "noEmailSend",
  "noCalendarBooking",
  "noPriceGuideAutomation",
  "noHardDelete"
]) {
  assert(qaHelper.includes(phrase), `QA workflow helper missing ${phrase}.`);
}

const quotationRepo = read("lib/data/quotation-repository.ts");
const sendGateBody = quotationRepo.slice(
  quotationRepo.indexOf("export function buildQuotationSendGate"),
  quotationRepo.indexOf("async function saveQuotationPackage")
);
assert(sendGateBody.includes("status !== \"Boss Approved\""), "Real Send Gate must still require Boss Approved status.");
assert(sendGateBody.includes("valid uploaded quotation file is missing"), "Real Send Gate must still require uploaded quotation file metadata.");
assert(sendGateBody.includes("isProductionHiddenLead(lead)"), "Real Send Gate must still block production-hidden/test/demo/archived leads.");
assert(!sendGateBody.includes("qaSimulate"), "Real Send Gate must not contain QA bypass logic.");
for (const phrase of [
  "qaSimulateQuotationSent",
  "qaSimulateQuotationAccepted",
  "qa_mark_sent_simulated",
  "qa_quote_accepted_simulated",
  "realSendGateUnchanged",
  "createsOnlyTestMarkedDownstreamRecords"
]) {
  assert(quotationRepo.includes(phrase), `Quotation repository missing ${phrase}.`);
}

const actions = read("lib/actions.ts");
for (const phrase of [
  "qaMarkSentSimulationAction",
  "qaMarkAcceptedSimulationAction",
  "qaCreateTestCollectionScheduleAction",
  "qaCreateTestDeliveryGateAction",
  "qaArchiveQaLeadAction",
  "requirePermission(\"approve_requests\")",
  "getQaWorkflowTestEligibility",
  "QA workflow blocked",
  "qaWorkflowSafetyMetadata",
  "createQaTestProjectForQuotation",
  "createQaTestCollectionSchedule"
]) {
  assert(actions.includes(phrase), `Server actions missing ${phrase}.`);
}
const qaActionsBlock = actions.slice(actions.indexOf("async function requireQaQuotationWorkflowContext"), actions.indexOf("export async function markQuoteRejectedAction"));
for (const forbidden of ["sendReply(", "WhatsAppCloudApiAdapter", "recordCalendarEventCreateRequested", "generateAndSaveAiDryRunRecommendation"]) {
  assert(!qaActionsBlock.includes(forbidden), `QA workflow actions must not call external automation path ${forbidden}.`);
}

const quotationPage = read("app/quotations/[id]/page.tsx");
for (const phrase of [
  "QA Workflow Test Controls",
  "QA TEST RECORD — NOT REAL CLIENT",
  "qa-mark-sent-simulation",
  "qa-mark-accepted-simulation",
  "qa-create-test-collection-schedule",
  "qa-create-test-delivery-gate",
  "qa-archive-qa-lead",
  "qa-workflow-feedback",
  "disabled={!qaEligibility.eligible}"
]) {
  assert(quotationPage.includes(phrase), `Quotation detail page missing ${phrase}.`);
}

const collectionRepo = read("lib/data/sales-collection-repository.ts");
for (const phrase of [
  "createQaTestProjectForQuotation",
  "createQaTestCollectionSchedule",
  "qa_delivery_gate_created",
  "qa_collection_schedule_created",
  "is_test: true",
  "isTest: Boolean(project.isTest || lead.isTest)",
  "filterProjectsForProductionVisibility(rawProjects, { ...options, visibleLeadIds })",
  "filterPaymentsForProductionVisibility(rawPayments, { ...options, visibleLeadIds, visibleProjectIds })"
]) {
  assert(collectionRepo.includes(phrase), `Collection repository missing ${phrase}.`);
}

const visibility = read("lib/production-visibility.ts");
assert(visibility.includes("if (project.isTest) return true;"), "Project test records must be hidden by production visibility.");
assert(visibility.includes("if (payment.isTest) return true;"), "Payment test records must be hidden by production visibility.");

const collectionPage = read("app/sales-collection/page.tsx");
const deliveryPage = read("app/delivery/page.tsx");
assert(collectionPage.includes("QA TEST RECORD — NOT REAL CLIENT"), "Collection Queue must show QA test badge when test records are visible.");
assert(deliveryPage.includes("QA TEST RECORD — NOT REAL CLIENT"), "Delivery page must show QA test badge when test records are visible.");
assert(collectionPage.includes("getShowTestDemoRecordsPreference"), "Collection Queue must keep show-test/demo preference.");
assert(deliveryPage.includes("getShowTestDemoRecordsPreference"), "Delivery page must keep show-test/demo preference.");

const migrationOrder = read("supabase/MIGRATION_ORDER.md");
const migration = read("supabase/migrations/025_qa_downstream_test_flags.sql");
assert(migrationOrder.includes("025_qa_downstream_test_flags.sql"), "Migration order must include QA downstream test flags migration.");
assert(migration.includes("project_accounts") && migration.includes("payment_records") && migration.includes("is_test"), "QA downstream migration must add project/payment is_test columns.");

console.log("PASS: QA-only downstream workflow test mode is gated, audited, hidden by default, and leaves the real Send Gate unchanged.");
