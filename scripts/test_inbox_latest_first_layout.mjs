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
const sendApi = read("app/api/inbox/send/route.ts");

const mainStart = inboxClient.indexOf("<main");
const mainEnd = inboxClient.indexOf("</main>", mainStart);
assert(mainStart >= 0 && mainEnd > mainStart, "main conversation layout not found.");
const mainLayout = inboxClient.slice(mainStart, mainEnd);

const headerIndex = mainLayout.indexOf("Active WhatsApp Chat");
const composerIndex = mainLayout.indexOf("<ReplyComposer");
const messageListIndex = mainLayout.indexOf("ref={messagePaneRef}");
const latestLabelIndex = mainLayout.indexOf("Latest messages");
assert(headerIndex >= 0, "conversation header missing.");
assert(composerIndex > headerIndex, "composer must appear after conversation header.");
assert(messageListIndex > composerIndex, "message list must appear after composer.");
assert(latestLabelIndex > composerIndex, "latest messages label must appear below composer.");

assertIncludes(inboxClient, "function sortMessagesNewestFirst", "newest-first sorting helper");
assertIncludes(inboxClient, "() => sortMessagesNewestFirst(collapseHistoricalDuplicateAiMessages(activeMessages))", "newest-first active messages with safe duplicate display collapse");
assertIncludes(inboxClient, "activeMessagesNewestFirst.map((message) =>", "newest-first message rendering");
assertIncludes(inboxClient, "stickToLatestRef", "latest-first scroll guard");
assertIncludes(inboxClient, "messagePaneRef.current?.scrollTo({ top: 0", "latest-first scroll position");

const messagePaneStart = mainLayout.indexOf("ref={messagePaneRef}");
const messagePane = mainLayout.slice(messagePaneStart);
const messagesRenderIndex = messagePane.indexOf("activeMessagesNewestFirst.map");
const loadOlderIndex = messagePane.indexOf("Load older messages");
assert(messagesRenderIndex >= 0, "newest-first message render block missing.");
assert(loadOlderIndex > messagesRenderIndex, "Load older messages must appear after latest-first message list.");
assert(!messagePane.includes("Load earlier messages"), "latest-first layout must not use old Load earlier copy.");

const composerStart = inboxClient.indexOf("function ReplyComposer");
const composerEnd = inboxClient.indexOf("const LeadContextPanel", composerStart);
assert(composerStart >= 0 && composerEnd > composerStart, "ReplyComposer block not found.");
const composer = inboxClient.slice(composerStart, composerEnd);
assertIncludes(composer, 'fetch("/api/inbox/send"', "JSON inbox send path");
assertIncludes(composer, "event.preventDefault()", "no full page reload send");
assertIncludes(composer, "setReply(\"\")", "composer clears immediately");
assertIncludes(composer, "isSending ? \"Sending...\" : \"Send\"", "button-only sending state");
assertIncludes(composer, "onClick={() => insertQuickReply(item.text)}", "quick replies insert text only");

const quickReplyStart = composer.indexOf("const insertQuickReply");
const quickReplyEnd = composer.indexOf("const handleSubmit", quickReplyStart);
assert(quickReplyStart >= 0 && quickReplyEnd > quickReplyStart, "quick reply insert block not found.");
const quickReplyBlock = composer.slice(quickReplyStart, quickReplyEnd);
assert(!quickReplyBlock.includes("fetch("), "quick replies must not send.");
assert(!quickReplyBlock.includes("requestSubmit"), "quick replies must not submit.");

for (const label of [
  "Ask property type",
  "Ask floor plan/photos",
  "Ask scope",
  "Ask appointment",
  "Instagram portfolio",
  "Acknowledge & review",
  "Ask design/reference images",
  "Team review handoff",
  "Ask condo/HDB/landed"
]) {
  assertIncludes(inboxClient, label, "operator quick reply");
}

assertIncludes(inboxClient, "showTechnicalAudit ? (", "technical audit lazy rendering");
assert(!inboxClient.includes("<details open"), "technical audit must remain collapsed by default.");

for (const phrase of [
  "NextResponse.json({",
  "clientTempId",
  "messageId: saved.id",
  "providerMessageId: sent.providerMessageId || \"\"",
  "whatsappStatus: \"sent\""
]) {
  assertIncludes(sendApi, phrase, "POST /api/inbox/send JSON contract");
}

assert(!composer.includes("router.refresh"), "composer must not refresh the inbox route.");
assert(!composer.includes("sendManualWhatsAppReplyAction"), "composer must not use legacy server action.");
assert(!sendApi.includes("redirect("), "send API must not redirect.");

console.log("PASS: /inbox latest-first operator layout test passed.");
