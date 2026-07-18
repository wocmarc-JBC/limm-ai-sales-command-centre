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
const settingsPage = read("app/settings/page.tsx");

for (const phrase of [
  "Show internal/test leads",
  "internal/test",
  "test leads",
  "QA leads",
  "hiddenInternalCount",
  "showInternalTestLeads",
  "setShowInternalTestLeads",
  "internalTestSignals",
  "isInternalTestChat",
  "isNonProductionChat",
  "nonProductionSignals",
  " hidden)"
]) {
  assertNotIncludes(inboxClient, phrase, "daily inbox live-mode copy");
}

for (const phrase of [
  "Queue",
  "Conversations",
  "Next waiting chat",
  "Search conversations",
  "Waiting for Marcus",
  "Waiting for client",
  "New leads",
  "Bot active",
  "Human takeover",
  "Failed send",
  "filteredConversations.map",
  "visibleChatSummaries"
]) {
  assertIncludes(inboxClient, phrase, "production inbox queue");
}

assertIncludes(inboxPage, "selectedLeadId={searchParams?.lead}", "active chat deep-link preservation");
assertIncludes(settingsPage, "Archived / QA Leads", "admin-only QA lead access");
assertIncludes(settingsPage, "/leads?view=all", "admin-only archived lead route");

console.log("PASS: live inbox cleanup proof passed.");
