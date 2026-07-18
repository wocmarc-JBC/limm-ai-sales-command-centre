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

const { classifyConversationIntent } = require(path.join(ROOT, "lib/whatsapp-intent-gate.ts"));
const { orchestrateWhatsAppConversationReply } = require(path.join(ROOT, "lib/whatsapp-reply-decision.ts"));

const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}
function lead(overrides = {}) {
  return {
    id: "existing-client-lead",
    clientName: "Existing Client",
    phone: "6594444444",
    source: "WhatsApp",
    division: "LIMM Works",
    propertyType: "Landed",
    serviceType: "A&A",
    scopeSummary: "Ongoing landed A&A project",
    leadScore: 90,
    leadCategory: "Hot",
    status: "Quotation Readiness",
    missingInfo: [],
    aiRecommendedNextAction: "Project team follow-up.",
    bossApprovalNeeded: false,
    appointmentReadiness: 100,
    quotationReadiness: 100,
    lastClientMessage: "",
    lastReplyAt: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    riskFlags: [],
    projectId: "project-existing-001",
    salesStage: "Won",
    confirmedValue: 180000,
    wonDate: "2026-05-01T00:00:00.000Z",
    leadEligible: true,
    conversationIntent: "genuine_new_renovation_lead",
    conversationRoute: "sales_lead",
    ...overrides
  };
}
function outbound(body, metadata = {}) {
  return {
    id: "existing-client-outbound",
    leadId: "existing-client-lead",
    direction: "outbound",
    channel: "whatsapp",
    body,
    safeToSend: true,
    providerMessageId: "wamid.existing.outbound",
    providerTimestamp: "2026-07-18T00:00:02.000Z",
    whatsappStatus: "sent",
    metadata,
    createdAt: "2026-07-18T00:00:02.000Z"
  };
}

const body = "Can you check the defect at our current project? The site progress photo is attached.";
const gate = classifyConversationIntent({ currentMessageText: body, currentMessageType: "text", recentMessages: [], lead: lead() });
check("Won/project-linked record routes as existing client", gate.primaryIntent === "existing_client_project_message", JSON.stringify(gate));
check("Existing client is removed from new-sales queues", !gate.leadEligible && gate.conversationRoute === "existing_client" && gate.excludeFromCommandCoreSales, JSON.stringify(gate));
check("Existing client bypasses renovation fact extraction", gate.shouldExtractLeadFacts === false);

const decision = orchestrateWhatsAppConversationReply({
  inboundMessageText: body,
  inboundMessageType: "text",
  lead: lead(),
  previousMessages: [],
  autoReplyEnabled: true,
  openAiEnabled: false,
  providerMessageId: "wamid.existing.inbound",
  intentGateDecision: gate
});
check("Existing client receives a project-team acknowledgement", decision.shouldReply && decision.replyText === "Thanks, noted. I’ll pass this to the project team to review and follow up.", decision.replyText);
check("Existing client is marked for human handoff", decision.handoffRequired && decision.conversationRoute === "existing_client", JSON.stringify(decision));
check("Existing client never enters v9 sales composition", decision.blackBoxTrace.v9ProductionRouteEnabled === false, JSON.stringify(decision.blackBoxTrace));

const secondDecision = orchestrateWhatsAppConversationReply({
  inboundMessageText: "The defect is near the wet kitchen.",
  inboundMessageType: "text",
  lead: lead({ conversationIntent: "existing_client_project_message", conversationRoute: "existing_client", leadEligible: false }),
  previousMessages: [outbound(decision.replyText, { conversationIntent: "existing_client_project_message" })],
  autoReplyEnabled: true,
  openAiEnabled: false,
  providerMessageId: "wamid.existing.second"
});
check("Existing-client acknowledgement does not loop", !secondDecision.shouldReply && /already_sent/.test(secondDecision.intentionalNoReplyReason ?? ""), JSON.stringify(secondDecision));

const pausedGate = classifyConversationIntent({
  currentMessageText: "I want a full HDB renovation and need a quote.",
  currentMessageType: "text",
  recentMessages: [],
  lead: lead({ botPaused: true, intentManualOverride: "genuine_new_renovation_lead" }),
  botPaused: true
});
check("Human takeover outranks manual and sales intent", pausedGate.primaryIntent === "human_takeover_or_bot_paused" && pausedGate.confidence === 1, JSON.stringify(pausedGate));
const pausedDecision = orchestrateWhatsAppConversationReply({
  inboundMessageText: "I want a full HDB renovation and need a quote.",
  inboundMessageType: "text",
  lead: lead({ botPaused: true }),
  previousMessages: [],
  autoReplyEnabled: true,
  openAiEnabled: false,
  intentGateDecision: pausedGate
});
check("Final human takeover guard always suppresses auto reply", !pausedDecision.shouldReply && pausedDecision.intentionalNoReplyReason === "human_takeover_or_bot_paused", JSON.stringify(pausedDecision));
const liveHandler = fs.readFileSync(path.join(ROOT, "lib/whatsapp-auto-reply.ts"), "utf8");
check(
  "Live final guard fails closed when lead state cannot be verified",
  liveHandler.includes("final_human_takeover_state_unavailable") &&
    liveHandler.includes("Final human-takeover state could not be verified; no auto-reply was sent.")
);

const vendorContactGate = classifyConversationIntent({
  currentMessageText: "Hello",
  currentMessageType: "text",
  recentMessages: [],
  lead: lead({ projectId: undefined, salesStage: "New Lead", wonDate: null, confirmedValue: 0, conversationIntent: "vendor_supplier_solicitation", conversationRoute: "vendor_inbox", leadEligible: false })
});
check("Known business contact stays out of sales on a generic ping", vendorContactGate.primaryIntent === "existing_vendor_or_business_contact" && !vendorContactGate.leadEligible, JSON.stringify(vendorContactGate));

const failures = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"}: ${item.name}${!item.passed && item.detail ? ` — ${item.detail}` : ""}`);
if (failures.length) process.exit(1);
console.log(`PASS: existing-client and human-takeover routing (${checks.length} checks).`);
