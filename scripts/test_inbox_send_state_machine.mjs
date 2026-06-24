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

const replyComposerStart = inboxClient.indexOf("function ReplyComposer");
const replyComposerEnd = inboxClient.indexOf("const LeadContextPanel");
assert(replyComposerStart >= 0 && replyComposerEnd > replyComposerStart, "ReplyComposer block not found.");
const replyComposer = inboxClient.slice(replyComposerStart, replyComposerEnd);

for (const phrase of [
  "type SendState",
  "sendingByLeadId",
  "errorByLeadId",
  "handleSendStarted",
  "handleSendFinished",
  "sendingState={sendingByLeadId[activeConversation.lead.id]}",
  "onSendStarted={handleSendStarted}",
  "onSendFinished={handleSendFinished}",
  "clientTempId",
  "onOptimisticReply(leadId, optimistic)",
  "setReply(\"\")",
  "fetch(\"/api/inbox/send\"",
  "new AbortController()",
  "SEND_TIMEOUT_MS = 15000",
  "signal: controller.signal",
  "settleOnce",
  "finishOnce",
  "window.clearTimeout(timeoutId)",
  "debugInboxSendState(\"send started\"",
  "debugInboxSendState(\"api response received\"",
  "debugInboxSendState(\"finally executed\"",
  "isSending ? \"Sending...\" : \"Send\""
]) {
  assertIncludes(inboxClient, phrase, "inbox send state machine");
}

for (const phrase of [
  "event.preventDefault()",
  "if (!body || isSending) return",
  "body: JSON.stringify({ leadId, body, clientTempId })",
  "ok: Boolean(data?.ok)",
  "providerMessageId: typeof data?.providerMessageId === \"string\"",
  "whatsappStatus: data?.whatsappStatus === \"sent\" || data?.whatsappStatus === \"failed\"",
  "errorCode: timedOut ? \"send_timeout\" : \"network_error\"",
  "setReply(body)"
]) {
  assertIncludes(replyComposer, phrase, "ReplyComposer send handler");
}

assert(!replyComposer.includes("action={"), "ReplyComposer must not use a server action form submit.");
assert(!replyComposer.includes("formAction"), "ReplyComposer must not use formAction.");
assert(!replyComposer.includes("useTransition"), "ReplyComposer must not use transition pending state.");
assert(!replyComposer.includes("router.refresh"), "ReplyComposer must not refresh the route.");
assert(!replyComposer.includes("sendManualWhatsAppReplyAction"), "ReplyComposer must not call the old redirect server action.");

for (const phrase of [
  "NextResponse.json({",
  "ok: true",
  "leadId",
  "clientTempId",
  "messageId: saved.id",
  "providerMessageId: sent.providerMessageId || \"\"",
  "whatsappStatus: \"sent\"",
  "createdAt: saved.createdAt",
  "ok: false",
  "errorCode:",
  "errorMessage:"
]) {
  assertIncludes(sendApi, phrase, "POST /api/inbox/send JSON contract");
}

assert(!sendApi.includes("redirect("), "POST /api/inbox/send must not redirect.");
assert(!sendApi.includes("revalidatePath"), "POST /api/inbox/send must not revalidate the whole inbox.");
assert(!sendApi.includes("sendManualWhatsAppReplyAction"), "POST /api/inbox/send must not call the old redirect server action.");
assert(!sendApi.includes("NEXT_REDIRECT"), "POST /api/inbox/send must not throw or store NEXT_REDIRECT.");
assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(inboxClient), "client inbox must not reference WhatsApp server credentials.");

for (const phrase of [
  "isLegacyRedirectFailure(message)",
  "isNextRedirectOnly",
  "messageClientTempId(message)",
  "providerMessageId: result.providerMessageId || message.providerMessageId",
  "clientSendFailed: !result.ok"
]) {
  assertIncludes(inboxClient, phrase, "optimistic reconciliation and redirect failure guard");
}

console.log("PASS: /inbox send state machine static test passed.");
