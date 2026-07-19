import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const helperSource = read("lib/inbox-message-attachments.ts");
const helperJs = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const module = { exports: {} };
vm.runInNewContext(`(function(exports,module){${helperJs}\n})(module.exports,module);`, { module });
const { attachLeadFilesToMessages } = module.exports;

const baseMessage = {
  id: "message-1",
  leadId: "lead-1",
  direction: "inbound",
  channel: "whatsapp",
  body: "[WhatsApp image received]",
  safeToSend: false,
  providerMessageId: "provider-1",
  whatsappStatus: "received",
  metadata: { messageType: "image", mimeType: "image/jpeg", mediaId: "private-media-id" },
  createdAt: "2026-07-19T10:00:00.000Z"
};
const failedFile = {
  id: "failed-file",
  leadId: "lead-1",
  fileCategory: "site_photos",
  fileStatus: "needs_clarification",
  originalFileName: "whatsapp-image-wamid.private.jpg",
  storageBucket: "client-files",
  storagePath: "private/failure/path",
  mimeType: "image/jpeg",
  fileSizeBytes: 0,
  source: "whatsapp",
  whatsappMessageId: "provider-1",
  whatsappMediaId: "private-media-id",
  uploadedAt: "2026-07-19T10:00:00.000Z",
  createdAt: "2026-07-19T10:00:00.000Z",
  updatedAt: "2026-07-19T10:00:00.000Z"
};
const readyFile = {
  ...failedFile,
  id: "ready-file",
  fileStatus: "received",
  fileSizeBytes: 245760,
  storagePath: "private/ready/path"
};

const readyResult = attachLeadFilesToMessages([baseMessage], [failedFile, readyFile]);
assert.equal(readyResult[0].attachments.length, 1, "A recovered file must suppress the superseded failure card.");
assert.equal(readyResult[0].attachments[0].id, "ready-file");
assert.equal(readyResult[0].attachments[0].availability, "ready");
assert.equal(readyResult[0].attachments[0].viewUrl, "/api/inbox/attachments/ready-file");
assert.equal(readyResult[0].attachments[0].downloadUrl, "/api/inbox/attachments/ready-file?download=1");
assert(!JSON.stringify(readyResult[0].attachments[0]).includes("private/ready/path"), "Storage paths must not reach the browser.");
assert(!JSON.stringify(readyResult[0].attachments[0]).includes("private-media-id"), "Meta media IDs must not reach the browser.");

const failedResult = attachLeadFilesToMessages([baseMessage], [failedFile]);
assert.equal(failedResult[0].attachments[0].availability, "unavailable");
assert.equal(failedResult[0].attachments[0].retryable, true);
assert.equal(failedResult[0].attachments[0].viewUrl, "");

const missingResult = attachLeadFilesToMessages([baseMessage], []);
assert.equal(missingResult[0].attachments[0].id, "missing-message-1");
assert.equal(missingResult[0].attachments[0].retryable, false);

const mediaStorage = read("lib/whatsapp-media-storage.ts");
for (const phrase of [
  "MEDIA_FETCH_RETRY_DELAYS_MS",
  "AbortSignal.timeout",
  'searchParams.set("phone_number_id"',
  "retryableMediaStatus",
  "safeMetaError",
  "retryWhatsAppMediaForLeadFile"
]) assert(mediaStorage.includes(phrase), `Media storage resilience missing ${phrase}`);
assert(!mediaStorage.includes("console.log"), "Media retrieval must not log tokens or signed URLs.");

const attachmentRoute = read("app/api/inbox/attachments/[fileId]/route.ts");
for (const phrase of [
  'getCurrentProfile()',
  'requirePermission("update_leads")',
  "getSignedLeadFileUrl(fileId, 90, { download })",
  '"Cache-Control": "private, no-store, max-age=0"',
  "retryWhatsAppMediaForLeadFile",
  "whatsapp_media_retry_failed"
]) assert(attachmentRoute.includes(phrase), `Private attachment route missing ${phrase}`);
assert(!/storagePath|whatsappMediaId/.test(attachmentRoute), "Attachment delivery route must not expose private storage or Meta identifiers.");

const inbox = read("components/inbox/MultiChatInbox.tsx");
for (const phrase of [
  "inbox-image-attachment",
  "inbox-document-attachment",
  "inbox-media-unavailable",
  "Retry retrieval",
  "limm-media-auto-retry:",
  "inboxMessageBodyText(message)",
  "onRetryAttachment"
]) assert(inbox.includes(phrase), `Inbox attachment UI missing ${phrase}`);

for (const file of [
  "app/inbox/page.tsx",
  "app/api/inbox/conversations/[leadId]/route.ts",
  "app/api/inbox/messages/route.ts"
]) assert(read(file).includes("attachLeadFilesToMessages"), `${file} must hydrate attachment metadata.`);

const autoReply = read("lib/whatsapp-auto-reply.ts");
assert(autoReply.includes("[WhatsApp ${message.type || \"message\"} received]"));
assert(!autoReply.includes("[Unsupported WhatsApp ${message.type"), "Supported media must not be labelled unsupported.");

const health = read("app/api/whatsapp/health/route.ts");
for (const marker of [
  "inboxMediaAttachmentVisibilityAvailable",
  "privateInboxAttachmentRedirectAvailable",
  "whatsappMediaFetchRetryAvailable",
  "whatsappMediaManualRecoveryAvailable"
]) assert(health.includes(marker), `Health proof missing ${marker}`);

console.log("PASS: authenticated WhatsApp image/document visibility, safe private delivery, and recovery checks passed.");
