import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function assertIncludes(source, phrase, label) {
  assert(source.includes(phrase), `${label} missing ${phrase}`);
}

function assertNotIncludes(source, phrase, label) {
  assert(!source.includes(phrase), `${label} must not include ${phrase}`);
}

const lifecycle = read("lib/production-lead-lifecycle.ts");
const inboxPage = read("app/inbox/page.tsx");
const conversationsApi = read("app/api/inbox/conversations/route.ts");
const commandCore = read("app/command-core/page.tsx");
const inboxClient = read("components/inbox/MultiChatInbox.tsx");
const settingsPage = read("app/settings/page.tsx");
const markScript = read("scripts/mark_qa_test_leads.mjs");

for (const phrase of [
  "ProductionLeadLifecycleStatus",
  "qa_test",
  "soft_deleted",
  "getQaTestLeadReasons",
  "isActiveProductionLeadForDailyScreens",
  "lead.deletedAt",
  "lead.archivedAt",
  "lead.isSpam",
  "lead.isTest",
  "phone contains explicit test marker",
  "phone equals +65_TEST_ONLY",
  "Test-only marker",
  "browser QA scope",
  "source or metadata contains QA seed marker"
]) {
  assertIncludes(lifecycle, phrase, "production lifecycle helper");
}

for (const name of ["marcus", "fio", "lee", "semon"]) {
  assertNotIncludes(lifecycle.toLowerCase(), name, "lifecycle helper must not hide ordinary names");
}

for (const [source, label] of [
  [inboxPage, "/inbox page"],
  [conversationsApi, "/api/inbox/conversations"],
  [commandCore, "/command-core"]
]) {
  assertIncludes(source, "listLeads({ includeTest: true })", `${label} source includes legacy-flagged records before lifecycle filtering`);
  assertIncludes(source, "isActiveProductionLeadForDailyScreens", `${label} production lifecycle filter`);
}

assertIncludes(inboxPage, "hasWhatsAppContactOrMessages", "/inbox active WhatsApp definition");
assertIncludes(conversationsApi, "hasWhatsAppContactOrMessages", "/api/inbox active WhatsApp definition");
assertIncludes(commandCore, "listLatestLeadMessagesForInbox", "Command Core message-aware QA filtering");
assertNotIncludes(commandCore, "testLeadCount", "Command Core daily test cleanup count");
assertNotIncludes(commandCore, "Clean test data", "Command Core daily test cleanup card");

for (const phrase of [
  "Show internal/test leads",
  "internal/test",
  "test leads",
  "hiddenInternalCount",
  "showInternalTestLeads",
  "internalTestSignals",
  "isInternalTestChat",
  "isNonProductionChat",
  "nonProductionSignals"
]) {
  assertNotIncludes(inboxClient, phrase, "live inbox UI wording");
}

assertIncludes(settingsPage, "Archived / QA Leads", "Settings admin non-production access");
assertIncludes(settingsPage, "/leads?view=all", "Settings archived/non-production lead route");

for (const phrase of [
  "const applyMode = process.argv.includes(\"--apply\")",
  "DRY RUN",
  "No changes made",
  "is_test: true",
  "archived_at",
  "No records hard-deleted",
  "audit_logs",
  "phone equals +65_TEST_ONLY",
  "Test-only marker",
  "browser QA scope"
]) {
  assertIncludes(markScript, phrase, "QA/test marker script");
}

console.log("PASS: production lead lifecycle filtering static test passed.");
