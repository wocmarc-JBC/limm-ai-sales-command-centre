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

const types = read("lib/types.ts");
for (const phrase of [
  "export interface QuotationPackage",
  "Submitted for Boss Review",
  "Boss Approved",
  "Sent to Client",
  "Accepted",
  "internalCostEstimate",
  "storagePath"
]) {
  assert(types.includes(phrase), `Quotation package type missing ${phrase}`);
}

const quotationRepo = read("lib/data/quotation-repository.ts");
for (const phrase of [
  "uploadDraftQuotation",
  "submitQuotationForBossReview",
  "recordQuotationBossDecision",
  "buildQuotationSendGate",
  "markQuotationSent",
  "markQuotationClientAccepted",
  "qaE2eSafetyMetadata"
]) {
  assert(quotationRepo.includes(phrase), `Quotation repository missing ${phrase}`);
}
assert(/status !== "Boss Approved"/.test(quotationRepo), "Quotation send gate must require Boss Approved status.");
assert(/valid uploaded quotation file is missing/.test(quotationRepo), "Quotation send gate must require uploaded file metadata.");

const qaMode = read("lib/qa-e2e-mode.ts");
for (const phrase of ["noWhatsAppSend", "noEmailSend", "noCalendarBooking", "noHardDelete", "noProductionClientMutation", "noPriceGuideAutomation"]) {
  assert(qaMode.includes(phrase), `QA E2E safety metadata missing ${phrase}`);
}

const actions = read("lib/actions.ts");
for (const phrase of [
  "createQuotationPackageAction",
  "submitQuotationForBossReviewAction",
  "recordQuotationBossAction",
  "markQuoteAcceptedAction",
  "createDefaultPaymentScheduleForProject",
  "recordPaymentReceivedAction",
  "dataHygieneCleanupAction"
]) {
  assert(actions.includes(phrase), `Server actions missing ${phrase}`);
}
assert(!/sendReply\(/.test(quotationRepo), "Quotation workflow must not call WhatsApp sendReply.");

const visibility = read("lib/production-visibility.ts");
for (const phrase of ["miamamun", "semon", "generated test", "test approval", "filterQuotationPackagesForProductionVisibility"]) {
  assert(visibility.includes(phrase), `Production visibility missing ${phrase}`);
}

const collectionRepo = read("lib/data/sales-collection-repository.ts");
for (const phrase of [
  "projectIsLinkedToAcceptedWonLead",
  "leadIsAcceptedOrWon",
  "payment.amount > 0",
  "payment.status !== \"Disputed\"",
  "visibleProjectIds.has(payment.projectId)"
]) {
  assert(collectionRepo.includes(phrase), `Collection strict filtering missing ${phrase}`);
}

const dataHygienePage = read("app/data-hygiene/page.tsx");
for (const phrase of [
  "Preview test/demo/QA records",
  "Leads",
  "Approval requests",
  "Project accounts",
  "Payment records",
  "Client files",
  "Soft Archive Selected",
  "Restore Selected"
]) {
  assert(dataHygienePage.includes(phrase), `Data Hygiene page missing ${phrase}`);
}

const e2e = read("tests/e2e/boss-ops-quotation-data-hygiene.spec.ts");
for (const phrase of [
  "artifacts",
  "e2e-test-report.md",
  "e2e-test-report.json",
  "QA_E2E_MODE",
  "Create Quotation Package",
  "Approve Quote",
  "Mark Quote Accepted",
  "Data Hygiene preview suspected records"
]) {
  assert(e2e.includes(phrase), `E2E spec missing ${phrase}`);
}

console.log("PASS: quotation workflow, data hygiene, collection filtering, and QA E2E static checks.");
