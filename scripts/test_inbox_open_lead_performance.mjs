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

const inboxClient = read("components/inbox/MultiChatInbox.tsx");
const inboxPage = read("app/inbox/page.tsx");
const detailApi = read("app/api/inbox/conversations/[leadId]/route.ts");
const budgetTest = read("scripts/test_inbox_performance_budget.mjs");

for (const phrase of [
  "setActiveLeadId(leadId)",
  "window.history.replaceState",
  "fetch(`/api/inbox/conversations/${encodeURIComponent(leadId)}`",
  "conversationCache",
  "conversationCacheRef",
  "fetchedAt",
  "loadConversation(leadId, { background: true })",
  ".slice(0, 3)",
  "memo(function ChatRow",
  "memo(function MessageBubble",
  "memo(function LeadContextPanel",
  "useDeferredValue",
  "showTechnicalAudit ?",
  "View full lead detail"
]) {
  assertIncludes(inboxClient, phrase, "multi-chat inbox client");
}

for (const forbidden of [
  "useRouter",
  "router.push",
  "router.replace",
  "router.refresh",
  "sendManualWhatsAppReplyAction",
  'action={sendManualWhatsAppReplyAction}',
  "href={`/leads/${item.id}`",
  "href={`/leads/${chat.id}`"
]) {
  assert(!inboxClient.includes(forbidden), `multi-chat inbox client must not use ${forbidden} for chat switching.`);
}

for (const phrase of [
  "listLatestLeadMessagesForInbox(leadIds, 3)",
  "listLeadMessagesPage(selectedLead.id, 30)",
  "activeLeads = leads.slice(0, 30)",
  "auditTrail: []"
]) {
  assertIncludes(inboxPage, phrase, "/inbox page");
}

for (const forbidden of [
  "listAuditLogs",
  "selectedAuditLogs",
  "listLeadMessages(lead.id)"
]) {
  assert(!inboxPage.includes(forbidden), `/inbox page must not use ${forbidden} during initial chat open.`);
}

for (const phrase of [
  "listLeadMessagesPage(lead.id, 30)",
  "listLeadFiles(lead.id)",
  "hasOlderMessages",
  "oldestMessageCursor",
  "auditTrail: []"
]) {
  assertIncludes(detailApi, phrase, "selected conversation API");
}

for (const forbidden of [
  "listAuditLogs",
  "listLeads",
  "listLatestLeadMessagesForInbox",
  "rawPayload",
  "webhookPayload"
]) {
  assert(!detailApi.includes(forbidden), `selected conversation API must not return heavy data: ${forbidden}`);
}

assertIncludes(budgetTest, "selected conversation API must not fetch audit trails during chat open", "performance budget test");

console.log("PASS: /inbox open-lead performance architecture test passed.");
