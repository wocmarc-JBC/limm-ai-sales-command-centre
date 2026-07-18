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
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename
  }).outputText;
  module._compile(output, filename);
};

const { identifyLatestUnansweredQuestion } = require(path.join(ROOT, "lib/whatsapp-conversation-safety.ts"));
const { classifyConversationIntent } = require(path.join(ROOT, "lib/whatsapp-intent-gate.ts"));
const { orchestrateWhatsAppConversationReply } = require(path.join(ROOT, "lib/whatsapp-reply-decision.ts"));

const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}
function message(body, direction, index) {
  return {
    id: `question-${direction}-${index}`,
    leadId: "question-lead",
    direction,
    channel: "whatsapp",
    body,
    safeToSend: direction === "outbound",
    providerMessageId: `wamid.question.${direction}.${index}`,
    providerTimestamp: `2026-07-18T00:00:${String(index).padStart(2, "0")}.000Z`,
    whatsappStatus: direction === "outbound" ? "sent" : "received",
    metadata: {},
    createdAt: `2026-07-18T00:00:${String(index).padStart(2, "0")}.000Z`
  };
}

const priceQuestion = message("Roughly how much would the renovation cost?", "inbound", 1);
const laterFact = message("It is a 5-room HDB.", "inbound", 2);
const unanswered = identifyLatestUnansweredQuestion({ messages: [laterFact, priceQuestion] });
check("Question selection is chronological, not input-order dependent", unanswered?.providerMessageId === priceQuestion.providerMessageId, JSON.stringify(unanswered));
check("Question category is persisted for planning", unanswered?.category === "price", JSON.stringify(unanswered));

const answered = identifyLatestUnansweredQuestion({
  messages: [priceQuestion, message("We need to review the scope before giving a responsible figure.", "outbound", 2)]
});
check("A client-facing outbound reply closes the earlier question", answered === null, JSON.stringify(answered));

const failedOutbound = message("This reply did not reach the client.", "outbound", 2);
failedOutbound.whatsappStatus = "failed";
const stillUnansweredAfterFailure = identifyLatestUnansweredQuestion({ messages: [priceQuestion, failedOutbound] });
check("A failed outbound does not close a client question", stillUnansweredAfterFailure?.messageId === priceQuestion.id, JSON.stringify(stillUnansweredAfterFailure));

const newerQuestion = message("Can we meet on Saturday?", "inbound", 4);
const latest = identifyLatestUnansweredQuestion({
  messages: [priceQuestion, message("We will review the price question.", "outbound", 2), message("Full kitchen and carpentry.", "inbound", 3), newerQuestion]
});
check("The latest still-unanswered question wins", latest?.providerMessageId === newerQuestion.providerMessageId && latest.category === "appointment", JSON.stringify(latest));

const lead = {
  id: "question-lead",
  clientName: "Question Client",
  phone: "6593333333",
  source: "WhatsApp",
  division: "LIMM Works",
  propertyType: "HDB",
  serviceType: "initial_project_review",
  scopeSummary: "5-room HDB full renovation",
  leadScore: 55,
  leadCategory: "Warm",
  status: "New Enquiry",
  missingInfo: ["floor_plan", "site_photos"],
  aiRecommendedNextAction: "Answer direct question.",
  bossApprovalNeeded: false,
  appointmentReadiness: 20,
  quotationReadiness: 0,
  lastClientMessage: laterFact.body,
  lastReplyAt: null,
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
  riskFlags: [],
  leadEligible: true,
  conversationIntent: "genuine_new_renovation_lead",
  conversationRoute: "sales_lead"
};
const gate = classifyConversationIntent({
  currentMessageText: laterFact.body,
  currentMessageType: "text",
  recentMessages: [priceQuestion, laterFact],
  lead
});
const recoveredDecision = orchestrateWhatsAppConversationReply({
  inboundMessageText: laterFact.body,
  inboundMessageType: "text",
  lead,
  previousMessages: [priceQuestion, laterFact],
  autoReplyEnabled: true,
  openAiEnabled: false,
  providerMessageId: laterFact.providerMessageId,
  intentGateDecision: gate,
  latestUnansweredQuestion: unanswered
});
check("Planner recovers the latest unanswered client question", recoveredDecision.blackBoxTrace.plannerInboundRecoveredLatestQuestion === true, JSON.stringify(recoveredDecision.blackBoxTrace));
check("Recovered price question selects the price answer move", recoveredDecision.intent === "price_question" && recoveredDecision.salesMove === "safe_price_review", JSON.stringify(recoveredDecision));
check("Recovered answer is not replaced by a broad first-touch greeting", recoveredDecision.shouldReply && !/dream home/i.test(recoveredDecision.replyText), recoveredDecision.replyText);

const directQuestionGate = classifyConversationIntent({ currentMessageText: newerQuestion.body, currentMessageType: "text", recentMessages: [newerQuestion], lead });
const directQuestionDecision = orchestrateWhatsAppConversationReply({
  inboundMessageText: newerQuestion.body,
  inboundMessageType: "text",
  lead,
  previousMessages: [newerQuestion],
  autoReplyEnabled: true,
  openAiEnabled: false,
  providerMessageId: newerQuestion.providerMessageId,
  intentGateDecision: directQuestionGate,
  latestUnansweredQuestion: latest
});
check("Current direct questions do not need recovery injection", directQuestionDecision.blackBoxTrace.plannerInboundRecoveredLatestQuestion === false);

const failures = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"}: ${item.name}${!item.passed && item.detail ? ` — ${item.detail}` : ""}`);
if (failures.length) process.exit(1);
console.log(`PASS: latest unanswered question (${checks.length} checks).`);
