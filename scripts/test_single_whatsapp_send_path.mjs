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

const leadDetailPage = read("app/leads/[id]/page.tsx");
const legacyLeadDetailInbox = read("components/WhatsAppSalesInbox.tsx");
const inboxClient = read("components/inbox/MultiChatInbox.tsx");
const inboxSendApi = read("app/api/inbox/send/route.ts");
const legacyActions = read("lib/actions.ts");

for (const phrase of [
  "Read-only lead view",
  "Manual WhatsApp replies now happen only in the WhatsApp Inbox",
  "Reply in WhatsApp Inbox",
  "href={`/inbox?lead=${encodeURIComponent(lead.id)}`"
]) {
  assertIncludes(leadDetailPage, phrase, "/leads/[id] WhatsApp routing");
}

for (const forbidden of [
  "WhatsAppSalesInbox",
  "sendManualWhatsAppReplyAction",
  "sendManualWhatsAppTestAction",
  'name="manual_reply_body"',
  "Type your WhatsApp reply...",
  "Send WhatsApp",
  "Sending...",
  "Test send to Marcus first"
]) {
  assert(!leadDetailPage.includes(forbidden), `/leads/[id] must not render an active WhatsApp send composer: ${forbidden}`);
}

for (const phrase of [
  "Read-only: this lead-detail view is read-only for WhatsApp",
  "Reply in WhatsApp Inbox",
  "href={`/inbox?lead=${encodeURIComponent(lead.id)}`",
  "Legacy send tools disabled"
]) {
  assertIncludes(legacyLeadDetailInbox, phrase, "legacy lead-detail WhatsApp component");
}

for (const forbidden of [
  "sendManualWhatsAppReplyAction",
  "sendManualWhatsAppTestAction",
  'name="manual_reply_body"',
  "Type your WhatsApp reply...",
  "isSending ? \"Sending...\" : \"Send\"",
  "requestSubmit",
  "form ref={formRef}",
  "Send Test"
]) {
  assert(!legacyLeadDetailInbox.includes(forbidden), `legacy lead-detail WhatsApp component must not keep a live send path: ${forbidden}`);
}

for (const phrase of [
  'fetch("/api/inbox/send"',
  "clientTempId",
  "sendingByLeadId",
  "handleSendStarted",
  "handleSendFinished",
  "finishOnce",
  "settleOnce",
  "onOptimisticReply",
  "onSendSettled",
  "isSending ? \"Sending...\" : \"Send\""
]) {
  assertIncludes(inboxClient, phrase, "single active /inbox send path");
}

for (const forbidden of [
  "sendManualWhatsAppReplyAction",
  "sendManualWhatsAppTestAction",
  'action={sendManualWhatsAppReplyAction}',
  "formAction",
  "useTransition",
  "router.refresh()",
  "useRouter"
]) {
  assert(!inboxClient.includes(forbidden), `/inbox client must not use legacy redirect/revalidation send path: ${forbidden}`);
}

for (const phrase of [
  "POST(request: Request)",
  "request.json()",
  "clientTempId",
  "NextResponse.json({",
  "ok: true",
  "ok: false",
  "inboxJsonApiSend: true",
  "replaySafeJsonPost: true",
  "noTokenLogged: true"
]) {
  assertIncludes(inboxSendApi, phrase, "POST /api/inbox/send JSON API");
}

for (const forbidden of [
  "redirect(",
  "revalidatePath",
  "sendManualWhatsAppReplyAction",
  "sendManualWhatsAppTestAction",
  "NEXT_REDIRECT"
]) {
  assert(!inboxSendApi.includes(forbidden), `POST /api/inbox/send must be JSON-only and not use legacy path: ${forbidden}`);
}

assert(
  legacyActions.includes("sendManualWhatsAppReplyAction"),
  "legacy server action can remain in lib/actions.ts only if no daily UI imports it"
);
assert(
  !leadDetailPage.includes("sendManualWhatsAppReplyAction") &&
    !legacyLeadDetailInbox.includes("sendManualWhatsAppReplyAction") &&
    !inboxClient.includes("sendManualWhatsAppReplyAction"),
  "daily WhatsApp UI must not import or call the old manual server action"
);

assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(leadDetailPage), "/leads/[id] must not reference WhatsApp server credentials.");
assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(legacyLeadDetailInbox), "lead-detail client component must not reference WhatsApp server credentials.");
assert(!/WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(inboxClient), "/inbox client must not reference WhatsApp server credentials.");

console.log("PASS: single active WhatsApp send path verified.");
