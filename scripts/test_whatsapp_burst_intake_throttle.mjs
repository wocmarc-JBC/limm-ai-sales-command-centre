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

function lower(value) {
  return String(value ?? "").toLowerCase();
}

function baseLead(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: "qa-burst-intake-lead",
    clientName: "QA Burst Intake Client",
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

function inbound(body, index, leadId = "qa-burst-intake-lead", type = "text") {
  return {
    id: `qa-burst-in-${++idCounter}`,
    leadId,
    direction: "inbound",
    channel: "whatsapp",
    body,
    safeToSend: true,
    providerMessageId: `wamid.qa.burst.in.${idCounter}`,
    providerTimestamp: isoAt(index * 12),
    whatsappStatus: "received",
    metadata: { messageType: type },
    createdAt: isoAt(index * 12)
  };
}

function outbound(body, index, leadId = "qa-burst-intake-lead") {
  return {
    id: `qa-burst-out-${++idCounter}`,
    leadId,
    direction: "outbound",
    channel: "whatsapp",
    body,
    safeToSend: true,
    providerMessageId: `wamid.qa.burst.out.${idCounter}`,
    providerTimestamp: isoAt(index * 12 + 1),
    whatsappStatus: "sent",
    metadata: { source: "qa_burst_intake" },
    createdAt: isoAt(index * 12 + 1)
  };
}

function runConversation(messages, options = {}) {
  const lead = options.lead ?? baseLead();
  const previousMessages = [...(options.previousMessages ?? [])];
  const decisions = [];

  messages.forEach((item, index) => {
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

    decisions.push({ body, decision });
    previousMessages.push(current);
    if (decision.shouldReply && decision.replyText) {
      previousMessages.push(outbound(decision.replyText, index, lead.id));
    }
  });

  return { decisions, previousMessages };
}

function sentReplies(result) {
  return result.decisions.filter(({ decision }) => decision.shouldReply).map(({ decision }) => decision.replyText);
}

function decisionFor(result, body) {
  return result.decisions.find((item) => item.body === body)?.decision;
}

function traceFor(result, body) {
  return decisionFor(result, body)?.blackBoxTrace ?? {};
}

function suppressed(result, body) {
  return decisionFor(result, body)?.shouldReply === false &&
    traceFor(result, body).burstIntakeSuppressed === true;
}

const hdbBurst = runConversation(["Hello", "HDB", "5 room", "Full work", "Kitchen also"]);
const hdbReplies = sentReplies(hdbBurst);
const hdbFinal = decisionFor(hdbBurst, "Full work");
check("HDB burst sends first-touch plus one consolidated reply only", hdbReplies.length === 2, hdbReplies.join("\n---\n"));
check("HDB short property fact is suppressed", suppressed(hdbBurst, "HDB"), JSON.stringify(traceFor(hdbBurst, "HDB")));
check("HDB short flat fact is suppressed", suppressed(hdbBurst, "5 room"), JSON.stringify(traceFor(hdbBurst, "5 room")));
check("HDB consolidated reply sends when enough facts are known", hdbFinal?.shouldReply === true, hdbFinal?.replyText ?? "");
check("HDB consolidated reply uses captured facts", /5-room flat HDB|HDB/i.test(hdbFinal?.replyText ?? "") && /full renovation/i.test(hdbFinal?.replyText ?? ""), hdbFinal?.replyText ?? "");
check("Post-consolidation short add-on is suppressed", suppressed(hdbBurst, "Kitchen also"), JSON.stringify(traceFor(hdbBurst, "Kitchen also")));

const condoBurst = runConversation(["Hi", "condo", "kitchen"]);
check("Condo fact is suppressed while waiting for scope", suppressed(condoBurst, "condo"), JSON.stringify(traceFor(condoBurst, "condo")));
check("Condo kitchen sends one stage-aware reply", decisionFor(condoBurst, "kitchen")?.shouldReply === true && sentReplies(condoBurst).length === 2, sentReplies(condoBurst).join("\n---\n"));
check("Condo kitchen reply is not a repeated first-touch greeting", !/dream home/i.test(decisionFor(condoBurst, "kitchen")?.replyText ?? ""), decisionFor(condoBurst, "kitchen")?.replyText ?? "");

const landedBurst = runConversation(["Hello", "landed", "A&A", "wet kitchen extension"]);
check("Landed fact is suppressed", suppressed(landedBurst, "landed"), JSON.stringify(traceFor(landedBurst, "landed")));
check("A&A fragment is suppressed until specific scope arrives", suppressed(landedBurst, "A&A"), JSON.stringify(traceFor(landedBurst, "A&A")));
check("Landed wet kitchen extension sends consolidated reply", decisionFor(landedBurst, "wet kitchen extension")?.shouldReply === true, decisionFor(landedBurst, "wet kitchen extension")?.replyText ?? "");
check("Landed consolidated reply avoids approval promise", !/guarantee|sure pass|approval confirmed/i.test(decisionFor(landedBurst, "wet kitchen extension")?.replyText ?? ""), decisionFor(landedBurst, "wet kitchen extension")?.replyText ?? "");

const directQuestion = runConversation(["Hi", "HDB", "How much?"]);
check("Direct price question bypasses burst suppression", decisionFor(directQuestion, "How much?")?.shouldReply === true, JSON.stringify(traceFor(directQuestion, "How much?")));
check("Direct price question answers price safely", /cost depends|rough idea|pricing|review this/i.test(decisionFor(directQuestion, "How much?")?.replyText ?? ""), decisionFor(directQuestion, "How much?")?.replyText ?? "");
check("Direct price question gives no price/range/package", !/from\s*\$|around\s*\$|\$\d|package price/i.test(decisionFor(directQuestion, "How much?")?.replyText ?? ""), decisionFor(directQuestion, "How much?")?.replyText ?? "");

const approvalQuestion = runConversation(["Hi", "landed", "Need approval?"]);
check("Direct approval question bypasses burst suppression", decisionFor(approvalQuestion, "Need approval?")?.shouldReply === true, JSON.stringify(traceFor(approvalQuestion, "Need approval?")));
check("Direct approval question answers approval safely", /approval depends|approval requirements|scope and approval/i.test(decisionFor(approvalQuestion, "Need approval?")?.replyText ?? ""), decisionFor(approvalQuestion, "Need approval?")?.replyText ?? "");
check("Direct approval question gives no approval guarantee", !/sure pass|guarantee|approval confirmed/i.test(decisionFor(approvalQuestion, "Need approval?")?.replyText ?? ""), decisionFor(approvalQuestion, "Need approval?")?.replyText ?? "");

const humanTakeover = runConversation([
  "Hello",
  "HDB",
  { body: "5 room", autoReplyEnabled: false }
]);
check("Human takeover or bot-disabled burst does not send", decisionFor(humanTakeover, "5 room")?.shouldReply === false, JSON.stringify(traceFor(humanTakeover, "5 room")));

const chineseBurst = runConversation(["\u4f60\u597d", "HDB", "5\u623f", "\u5168\u5c4b\u88c5\u4fee"]);
const chineseMemory = decisionFor(chineseBurst, "\u5168\u5c4b\u88c5\u4fee")?.blackBoxTrace?.v9Memory ?? {};
check("Mandarin burst captures Chinese flat type", chineseMemory.flat_type === "5-room flat", JSON.stringify(chineseMemory));
check("Mandarin burst captures full renovation", lower(chineseMemory.scope_summary).includes("full renovation"), JSON.stringify(chineseMemory));
check("Mandarin burst suppresses short HDB and flat fragments", suppressed(chineseBurst, "HDB") && suppressed(chineseBurst, "5\u623f"), sentReplies(chineseBurst).join("\n---\n"));

const qaCentre = fs.readFileSync(path.join(ROOT, "app/qa-centre/page.tsx"), "utf8");
check("QA Centre includes burst intake section", qaCentre.includes("Burst intake") && qaCentre.includes("Quiet-window suppression"));

const failed = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}${item.detail ? `\n  ${item.detail}` : ""}`);
}

if (failed.length) {
  console.error(`\n${failed.length} burst intake checks failed.`);
  process.exit(1);
}

console.log(`\nPASS: ${checks.length} burst intake checks passed.`);
