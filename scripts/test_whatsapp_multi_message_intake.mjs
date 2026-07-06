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

const checks = [];

function check(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}

function lower(text) {
  return String(text ?? "").toLowerCase();
}

function baseLead(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: "qa-multi-message-intake",
    clientName: "QA Intake Client",
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

function inbound(body, index, leadId = "qa-multi-message-intake") {
  return {
    id: `qa-in-${++idCounter}`,
    leadId,
    direction: "inbound",
    channel: "whatsapp",
    body,
    safeToSend: true,
    providerMessageId: `wamid.qa.in.${idCounter}`,
    providerTimestamp: isoAt(index * 12),
    whatsappStatus: "received",
    metadata: { messageType: "text" },
    createdAt: isoAt(index * 12)
  };
}

function outbound(body, index, leadId = "qa-multi-message-intake") {
  return {
    id: `qa-out-${++idCounter}`,
    leadId,
    direction: "outbound",
    channel: "whatsapp",
    body,
    safeToSend: true,
    providerMessageId: `wamid.qa.out.${idCounter}`,
    providerTimestamp: isoAt(index * 12 + 1),
    whatsappStatus: "sent",
    metadata: { source: "qa_multi_message_intake" },
    createdAt: isoAt(index * 12 + 1)
  };
}

function runConversation(messages, lead = baseLead()) {
  const previousMessages = [];
  const decisions = [];

  messages.forEach((body, index) => {
    const current = inbound(body, index, lead.id);
    const decision = buildWhatsAppReplyDecision({
      inboundMessageText: body,
      inboundMessageType: "text",
      lead,
      previousMessages: [...previousMessages, current],
      autoReplyEnabled: true,
      openAiEnabled: false,
      calendarEventId: "",
      providerMessageId: current.providerMessageId
    });

    decisions.push({ body, decision });
    previousMessages.push(current);
    if (decision.shouldReply && decision.replyText) {
      previousMessages.push(outbound(decision.replyText, index, lead.id));
    }
  });

  return { decisions, previousMessages };
}

function firstTouchCount(decisions) {
  return decisions.filter(({ decision }) => decision.replyText.includes("We'd love to help create your dream home.")).length;
}

function repeatedFirstTouchAfterFirst(decisions) {
  return decisions.slice(1).some(({ decision }) => decision.replyText.includes("We'd love to help create your dream home."));
}

function finalMemory(result) {
  const finalDecision = result.decisions.at(-1)?.decision;
  return finalDecision?.blackBoxTrace?.v9Memory ?? {};
}

function replies(result) {
  return result.decisions.map(({ decision }) => decision.replyText);
}

const hdbFull = runConversation(["Hello", "5 room flat", "Hdb", "Full work"]);
const hdbMemory = finalMemory(hdbFull);
check("HDB sequence sends first-touch once", firstTouchCount(hdbFull.decisions) === 1, replies(hdbFull).join("\n---\n"));
check("HDB sequence does not repeat first-touch after short answers", !repeatedFirstTouchAfterFirst(hdbFull.decisions), replies(hdbFull).join("\n---\n"));
check("HDB sequence captures property type", hdbMemory.property_type === "HDB", JSON.stringify(hdbMemory));
check("HDB sequence captures flat type", hdbMemory.flat_type === "5-room flat", JSON.stringify(hdbMemory));
check("HDB sequence captures full renovation", lower(hdbMemory.scope_summary).includes("full renovation"), JSON.stringify(hdbMemory));
check(
  "HDB sequence final reply asks for files/references",
  /floor plan/i.test(hdbFull.decisions.at(-1).decision.replyText) &&
    /site photos/i.test(hdbFull.decisions.at(-1).decision.replyText) &&
    /reference images/i.test(hdbFull.decisions.at(-1).decision.replyText),
  hdbFull.decisions.at(-1).decision.replyText
);

const condoKitchen = runConversation(["Hi", "condo", "kitchen"]);
const condoMemory = finalMemory(condoKitchen);
check("Condo sequence sends first-touch once", firstTouchCount(condoKitchen.decisions) === 1, replies(condoKitchen).join("\n---\n"));
check("Condo sequence captures condo", condoMemory.property_type === "condo", JSON.stringify(condoMemory));
check("Condo sequence captures kitchen scope", lower(condoMemory.scope_summary).includes("kitchen"), JSON.stringify(condoMemory));
check(
  "Condo kitchen asks stage-aware kitchen question",
  /carpentry only|full kitchen works|floor plan|site photos/i.test(condoKitchen.decisions.at(-1).decision.replyText),
  condoKitchen.decisions.at(-1).decision.replyText
);

const landedAa = runConversation(["Hello", "landed", "A&A", "wet kitchen extension"]);
const landedMemory = finalMemory(landedAa);
check("Landed sequence sends first-touch once", firstTouchCount(landedAa.decisions) === 1, replies(landedAa).join("\n---\n"));
check("Landed sequence captures landed", landedMemory.property_type === "landed", JSON.stringify(landedMemory));
check("Landed sequence captures A&A", /a&a|landed/i.test(String(landedMemory.project_type)), JSON.stringify(landedMemory));
check("Landed sequence captures wet kitchen extension", /kitchen|extension/i.test(String(landedMemory.scope_summary)), JSON.stringify(landedMemory));
check("Landed sequence avoids approval promise", !/guarantee|sure pass|approved|approval confirmed/i.test(landedAa.decisions.at(-1).decision.replyText), landedAa.decisions.at(-1).decision.replyText);
check("Landed sequence avoids identical adjacent replies", replies(landedAa).every((reply, index, all) => index === 0 || reply !== all[index - 1]), replies(landedAa).join("\n---\n"));

const shortBurst = runConversation(["Hi", "HDB", "5 room", "full reno"]);
check("Short burst avoids repeated first-touch", firstTouchCount(shortBurst.decisions) === 1 && !repeatedFirstTouchAfterFirst(shortBurst.decisions), replies(shortBurst).join("\n---\n"));
check("Short burst avoids identical adjacent replies", replies(shortBurst).every((reply, index, all) => index === 0 || reply !== all[index - 1]), replies(shortBurst).join("\n---\n"));

const firstTouchThenHdb = runConversation(["Hello", "HDB"]);
check("HDB after first-touch is not greeted again", !firstTouchThenHdb.decisions.at(-1).decision.replyText.includes("We'd love to help create your dream home."), firstTouchThenHdb.decisions.at(-1).decision.replyText);
check("HDB after first-touch uses stage-aware reply", /HDB noted|full renovation|selected areas/i.test(firstTouchThenHdb.decisions.at(-1).decision.replyText), firstTouchThenHdb.decisions.at(-1).decision.replyText);

const qaCentre = fs.readFileSync(path.join(ROOT, "app/qa-centre/page.tsx"), "utf8");
check("QA Centre includes multi-message intake section", qaCentre.includes("Multi-message intake") && qaCentre.includes("Repeated first-touch guard"));

const failed = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}${item.detail ? `\n  ${item.detail}` : ""}`);
}

if (failed.length) {
  console.error(`\n${failed.length} multi-message intake checks failed.`);
  process.exit(1);
}

console.log(`\nPASS: ${checks.length} multi-message intake checks passed.`);
