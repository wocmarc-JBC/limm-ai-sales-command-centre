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

const inboxClient = read("components/inbox/MultiChatInbox.tsx");
const inboxPage = read("app/inbox/page.tsx");
const conversationsApi = read("app/api/inbox/conversations/route.ts");
const leadsRepo = read("lib/data/leads-repository.ts");

for (const [source, label] of [
  [inboxClient, "inbox client"],
  [inboxPage, "inbox page"],
  [conversationsApi, "inbox conversations API"]
]) {
  for (const phrase of [
    "Show internal/test leads",
    "internal/test",
    "test leads",
    "QA leads",
    "hiddenInternalCount",
    "showInternalTestLeads",
    "internalTestSignals",
    "isInternalTestChat",
    "isNonProductionChat",
    "nonProductionSignals"
  ]) {
    assertNotIncludes(source, phrase, label);
  }

  for (const name of ['"fio"', '"lee"', '"semon"']) {
    assertNotIncludes(source.toLowerCase(), name, `${label} name-based hiding`);
  }

  assertNotIncludes(source, "scoreTestLead", `${label} score-based hiding`);
  assertNotIncludes(source, "lead.isTest", `${label} test-flag hiding`);
}

for (const [source, label] of [
  [inboxPage, "inbox page active source"],
  [conversationsApi, "inbox API active source"]
]) {
  assertIncludes(source, "listLeads({ includeTest: true })", label);
  assertNotIncludes(source, "includeInactive: true", label);
  assertIncludes(source, "hasWhatsAppContactOrMessages", label);
  assertIncludes(source, "Boolean(lead.phone?.trim()) || messages.length > 0", label);
  assertIncludes(source, "listLatestLeadMessagesForInbox", label);
}

assertIncludes(leadsRepo, "if (!options?.includeInactive && (lead.deletedAt || lead.archivedAt || lead.isSpam)) return false;", "inactive lead exclusion");
assertIncludes(leadsRepo, "if (!options?.includeTest && lead.isTest) return false;", "default test flag filter outside inbox");
assertIncludes(leadsRepo, "if (!options?.includeTest && scoreTestLead(lead).clearlyTest) return false;", "default score filter outside inbox");

assertIncludes(inboxClient, 'activeLeadId ? "Conversation unavailable." : "No active conversations yet."', "empty-state behavior");
assertIncludes(inboxClient, "filteredConversations.length === 0", "filtered empty-state behavior");
assertIncludes(inboxClient, "Conversations", "conversation list label");
assertIncludes(inboxClient, "Waiting for Marcus", "production status labels");
assertIncludes(inboxClient, "Waiting for client", "production status labels");

console.log("PASS: live inbox active conversation source test passed.");
