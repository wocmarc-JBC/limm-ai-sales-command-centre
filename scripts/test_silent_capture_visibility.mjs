import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const target = path.join(ROOT, request.slice(2));
    if (fs.existsSync(target)) return target;
    if (fs.existsSync(`${target}.ts`)) return `${target}.ts`;
    if (fs.existsSync(`${target}.tsx`)) return `${target}.tsx`;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX
    },
    fileName: filename
  }).outputText;
  module._compile(output, filename);
};

const { buildWhatsAppReplyDecision } = require(path.join(ROOT, "lib/whatsapp-reply-decision.ts"));
const {
  SILENT_CAPTURE_REASON,
  buildSilentCaptureNoteFromDecision,
  isSilentCaptureMessage,
  latestSilentCapture,
  latestSilentCaptureWithoutNewerClientReply,
  silentCaptureSummary
} = require(path.join(ROOT, "lib/whatsapp-silent-capture.ts"));

const checks = [];

function check(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}

function lower(value) {
  return String(value ?? "").toLowerCase();
}

function baseLead(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: "qa-silent-capture-lead",
    clientName: "QA Silent Capture Client",
    phone: "6599999999",
    source: "WhatsApp",
    division: "LIMM Works",
    propertyType: "",
    serviceType: "",
    scopeSummary: "",
    leadScore: 30,
    leadCategory: "Warm",
    status: "New Enquiry",
    missingInfo: [],
    aiRecommendedNextAction: "QA simulation only.",
    bossApprovalNeeded: false,
    appointmentReadiness: 0,
    quotationReadiness: 0,
    lastClientMessage: "",
    lastReplyAt: null,
    createdAt: now,
    updatedAt: now,
    preferredContactTime: "",
    riskFlags: [],
    ...overrides
  };
}

let idCounter = 0;
const startTime = Date.parse("2026-01-01T00:00:00.000Z");

function isoAt(offsetSeconds) {
  return new Date(startTime + offsetSeconds * 1000).toISOString();
}

function inbound(body, index, leadId = "qa-silent-capture-lead", type = "text") {
  return {
    id: `qa-silent-in-${++idCounter}`,
    leadId,
    direction: "inbound",
    channel: "whatsapp",
    body,
    safeToSend: true,
    providerMessageId: `wamid.qa.silent.in.${idCounter}`,
    providerTimestamp: isoAt(index * 12),
    whatsappStatus: "received",
    metadata: { messageType: type },
    createdAt: isoAt(index * 12)
  };
}

function outbound(body, index, leadId = "qa-silent-capture-lead") {
  return {
    id: `qa-silent-out-${++idCounter}`,
    leadId,
    direction: "outbound",
    channel: "whatsapp",
    body,
    safeToSend: true,
    providerMessageId: `wamid.qa.silent.out.${idCounter}`,
    providerTimestamp: isoAt(index * 12 + 1),
    whatsappStatus: "sent",
    metadata: { source: "qa_silent_capture" },
    createdAt: isoAt(index * 12 + 1)
  };
}

function internalNoteFromDecision(decision, leadId, sourceMessageId, index) {
  const note = buildSilentCaptureNoteFromDecision(decision, { leadId, sourceMessageId });
  if (!note) return null;
  return {
    id: `qa-silent-note-${++idCounter}`,
    channel: "whatsapp",
    providerTimestamp: null,
    providerMessageId: undefined,
    createdAt: isoAt(index * 12 + 2),
    ...note
  };
}

function runConversation(items, options = {}) {
  const lead = options.lead ?? baseLead();
  const previousMessages = [...(options.previousMessages ?? [])];
  const decisions = [];
  const notes = [];

  items.forEach((item, index) => {
    const body = typeof item === "string" ? item : item.body;
    const type = typeof item === "string" ? "text" : item.type ?? "text";
    const autoReplyEnabled = typeof item === "string" ? true : item.autoReplyEnabled ?? true;
    const current = inbound(body, index, lead.id, type);
    const decision = buildWhatsAppReplyDecision({
      inboundMessageText: body,
      inboundMessageType: type,
      lead,
      previousMessages: [...previousMessages, current],
      autoReplyEnabled,
      openAiEnabled: false,
      calendarEventId: "",
      providerMessageId: current.providerMessageId
    });

    decisions.push({ body, current, decision });
    previousMessages.push(current);

    const note = internalNoteFromDecision(decision, lead.id, current.providerMessageId, index);
    if (note) {
      notes.push({ body, note });
      previousMessages.push(note);
    }

    if (decision.shouldReply && decision.replyText) {
      previousMessages.push(outbound(decision.replyText, index, lead.id));
    }
  });

  return { lead, decisions, notes, previousMessages };
}

function decisionFor(result, body) {
  return result.decisions.find((item) => item.body === body)?.decision;
}

function noteFor(result, body) {
  return result.notes.find((item) => item.body === body)?.note ?? null;
}

function sentReplyCount(result) {
  return result.decisions.filter(({ decision }) => decision.shouldReply && decision.replyText.trim()).length;
}

function firstTouchReplyCount(result) {
  return result.decisions.filter(({ decision }) => decision.replyText.includes("We'd love to help create your dream home.")).length;
}

function assertInternalOnlyNote(label, note) {
  check(`${label} note exists`, Boolean(note), JSON.stringify(note ?? null));
  if (!note) return;
  check(`${label} note uses internal direction`, note.direction === "internal", note.direction);
  check(`${label} note is not safe to send`, note.safeToSend === false, String(note.safeToSend));
  check(`${label} note is not an outbound message`, note.direction !== "outbound", note.direction);
  check(`${label} note has no provider message id`, !note.providerMessageId, String(note.providerMessageId ?? ""));
  check(`${label} note records visible_to_client false`, note.metadata?.visible_to_client === false, JSON.stringify(note.metadata));
  check(`${label} note records noClientSend true`, note.metadata?.noClientSend === true, JSON.stringify(note.metadata));
  check(`${label} note records suppression reason`, note.metadata?.reason === SILENT_CAPTURE_REASON, JSON.stringify(note.metadata));
  check(`${label} note can be identified for UI display`, isSilentCaptureMessage(note), JSON.stringify(note.metadata));
}

const hdbBurst = runConversation(["Hello", "HDB", "5 room", "Full work"]);
assertInternalOnlyNote("HDB property", noteFor(hdbBurst, "HDB"));
assertInternalOnlyNote("HDB flat", noteFor(hdbBurst, "5 room"));
const hdbFinal = decisionFor(hdbBurst, "Full work");
const hdbFinalAction = String(hdbFinal?.blackBoxTrace?.silentCaptureNextAction ?? "");
check("HDB burst sends first-touch once", firstTouchReplyCount(hdbBurst) === 1, hdbBurst.decisions.map(({ decision }) => decision.replyText).join("\n---\n"));
check("HDB short property fact is intentionally silent", decisionFor(hdbBurst, "HDB")?.shouldReply === false, JSON.stringify(decisionFor(hdbBurst, "HDB")?.blackBoxTrace ?? {}));
check("HDB short flat fact is intentionally silent", decisionFor(hdbBurst, "5 room")?.shouldReply === false, JSON.stringify(decisionFor(hdbBurst, "5 room")?.blackBoxTrace ?? {}));
check("HDB burst sends final consolidated reply", hdbFinal?.shouldReply === true, hdbFinal?.replyText ?? "");
check("HDB final next action asks floor plan/photos/reference images", /floor plan/i.test(hdbFinalAction) && /site photos/i.test(hdbFinalAction) && /reference images/i.test(hdbFinalAction), hdbFinalAction);
check("HDB internal notes are not client-facing replies", hdbBurst.notes.every(({ note }) => note.direction === "internal" && note.safeToSend === false), JSON.stringify(hdbBurst.notes));
check("HDB silent capture summary is readable", /Property type: HDB/i.test(silentCaptureSummary(noteFor(hdbBurst, "HDB")).fieldSummary), silentCaptureSummary(noteFor(hdbBurst, "HDB")).fieldSummary);

const condoBurst = runConversation(["Hi", "condo", "kitchen"]);
assertInternalOnlyNote("Condo property", noteFor(condoBurst, "condo"));
const condoFinal = decisionFor(condoBurst, "kitchen");
check("Condo kitchen sends a stage-aware reply", condoFinal?.shouldReply === true && /kitchen/i.test(condoFinal.replyText), condoFinal?.replyText ?? "");
check("Condo burst does not repeat greeting", firstTouchReplyCount(condoBurst) === 1, condoBurst.decisions.map(({ decision }) => decision.replyText).join("\n---\n"));
check("Condo silent note summary includes condo", /condo/i.test(silentCaptureSummary(noteFor(condoBurst, "condo")).fieldSummary), silentCaptureSummary(noteFor(condoBurst, "condo")).fieldSummary);

const landedBurst = runConversation(["Hello", "landed", "A&A", "wet kitchen extension"]);
assertInternalOnlyNote("Landed property", noteFor(landedBurst, "landed"));
assertInternalOnlyNote("Landed A&A", noteFor(landedBurst, "A&A"));
const landedFinal = decisionFor(landedBurst, "wet kitchen extension");
check("Landed A&A final reply sends", landedFinal?.shouldReply === true, landedFinal?.replyText ?? "");
check("Landed A&A final reply gives no approval promise", !/guarantee|sure pass|approval confirmed/i.test(landedFinal?.replyText ?? ""), landedFinal?.replyText ?? "");
check("Landed A&A next action asks layout/site photos/areas", /layout|site photos|areas/i.test(String(landedFinal?.blackBoxTrace?.silentCaptureNextAction ?? landedFinal?.nextAction ?? "")), String(landedFinal?.blackBoxTrace?.silentCaptureNextAction ?? landedFinal?.nextAction ?? ""));

const humanTakeover = runConversation(["Hello", "HDB", { body: "5 room", autoReplyEnabled: false }]);
assertInternalOnlyNote("Human takeover suppressed fact", noteFor(humanTakeover, "5 room"));
check("Human takeover suppressed burst does not send a client reply", decisionFor(humanTakeover, "5 room")?.shouldReply === false, JSON.stringify(decisionFor(humanTakeover, "5 room")?.blackBoxTrace ?? {}));
check("Human takeover does not create outbound note", humanTakeover.notes.every(({ note }) => note.direction !== "outbound"), JSON.stringify(humanTakeover.notes));

const timeline = hdbBurst.previousMessages;
const latest = latestSilentCapture(timeline, 100000);
check("Latest silent capture helper finds internal note", latest?.direction === "internal", JSON.stringify(latest ?? null));
check("Command Core helper hides stale capture after newer outbound", latestSilentCaptureWithoutNewerClientReply(timeline, 100000) === null, "HDB final reply was sent after the captured fragments.");
const recentOnly = [noteFor(hdbBurst, "HDB")].filter(Boolean);
check("Command Core helper shows recent capture when no newer client-facing reply exists", latestSilentCaptureWithoutNewerClientReply(recentOnly, 100000)?.direction === "internal", JSON.stringify(recentOnly));

for (const { note } of [...hdbBurst.notes, ...condoBurst.notes, ...landedBurst.notes, ...humanTakeover.notes]) {
  check("Silent note body is labelled as internal AI capture", /AI captured facts silently/i.test(note.body), note.body);
  check("Silent note body does not look sent", !/sent to client|message sent|whatsapp sent/i.test(lower(note.body)), note.body);
}

const inboxSource = fs.readFileSync(path.join(ROOT, "components/inbox/MultiChatInbox.tsx"), "utf8");
check("Inbox renders silent capture notes as AI notes", inboxSource.includes("AI note") && inboxSource.includes("Recent AI capture"));
check("Inbox labels silent capture as internal only", inboxSource.includes("Internal only - not sent to client") && inboxSource.includes("Internal only"));

const commandCoreSource = fs.readFileSync(path.join(ROOT, "app/command-core/page.tsx"), "utf8");
check("Command Core renders silent capture indicator", commandCoreSource.includes("Facts captured silently") && commandCoreSource.includes("latestSilentCaptureWithoutNewerClientReply"));

const qaCentreSource = fs.readFileSync(path.join(ROOT, "app/qa-centre/page.tsx"), "utf8");
check("QA Centre displays suppressed burst details", qaCentreSource.includes("suppressed, captured property_type=HDB") && qaCentreSource.includes("consolidated reply sent") && qaCentreSource.includes("Next action: Ask for floor plan/photos/reference images"));

const autoReplySource = fs.readFileSync(path.join(ROOT, "lib/whatsapp-auto-reply.ts"), "utf8");
const silentBranchIndex = autoReplySource.indexOf("buildSilentCaptureNoteFromDecision");
const validationIndex = autoReplySource.indexOf("whatsapp_auto_reply_validation_started");
check("Auto-reply saves silent capture before final send validation", silentBranchIndex >= 0 && validationIndex > silentBranchIndex, `${silentBranchIndex} ${validationIndex}`);
check("Auto-reply audits silent capture instead of sending", autoReplySource.includes("whatsapp_silent_capture_recorded") && autoReplySource.includes("auto_reply_silent_capture"));

const failed = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}${item.detail ? `\n  ${item.detail}` : ""}`);
}

if (failed.length) {
  console.error(`\n${failed.length} silent capture visibility checks failed.`);
  process.exit(1);
}

console.log(`\nPASS: ${checks.length} silent capture visibility checks passed.`);
