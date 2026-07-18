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
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
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
    id: "intent-gate-lead",
    clientName: "WhatsApp Contact",
    phone: "6591111111",
    source: "WhatsApp",
    division: "LIMM Works",
    propertyType: "",
    serviceType: "conversation_pending_classification",
    scopeSummary: "",
    leadScore: 0,
    leadCategory: "Low Fit",
    status: "Not Suitable",
    missingInfo: [],
    aiRecommendedNextAction: "Classify intent.",
    bossApprovalNeeded: false,
    appointmentReadiness: 0,
    quotationReadiness: 0,
    lastClientMessage: "",
    lastReplyAt: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    riskFlags: [],
    leadEligible: false,
    conversationIntent: "unclear_intent",
    conversationRoute: "intent_review",
    ...overrides
  };
}

function message(body, direction, index, metadata = {}) {
  return {
    id: `intent-${direction}-${index}`,
    leadId: "intent-gate-lead",
    direction,
    channel: "whatsapp",
    body,
    safeToSend: direction === "outbound",
    providerMessageId: `wamid.intent.${direction}.${index}`,
    providerTimestamp: `2026-07-18T00:00:${String(index).padStart(2, "0")}.000Z`,
    whatsappStatus: direction === "outbound" ? "sent" : "received",
    metadata,
    createdAt: `2026-07-18T00:00:${String(index).padStart(2, "0")}.000Z`
  };
}

const vendorText = `Hi, I’m from TheBoxPhotography.
We provide interior photography services.
Our Pricing:
HDB/Condo/Apartments from $250
Landed property/Commercial/Industrial from $450
Hope to hear from you.
https://wa.me/6591234567
https://facebook.com/theboxphotography`;
const expectedVendorReply = "Thanks for reaching out and sharing your photography services. We’ll keep your details for future consideration.";
const vendorInbound = message(vendorText, "inbound", 1, { messageType: "text" });
const vendorGate = classifyConversationIntent({
  currentMessageText: vendorText,
  currentMessageType: "text",
  recentMessages: [vendorInbound],
  lead: lead()
});

check("TheBox is classified as vendor solicitation", vendorGate.primaryIntent === "vendor_supplier_solicitation", JSON.stringify(vendorGate));
check("TheBox confidence meets 0.95", vendorGate.confidence >= 0.95, String(vendorGate.confidence));
check("TheBox is not sales eligible", vendorGate.salesEligible === false && vendorGate.leadEligible === false, JSON.stringify(vendorGate));
check("TheBox uses one-time vendor acknowledgement", vendorGate.autoReplyPolicy === "one_time_vendor_acknowledgement", vendorGate.autoReplyPolicy);
check(
  "TheBox is excluded from every sales surface",
  vendorGate.excludeFromCommandCoreSales && vendorGate.excludeFromMissionMap && vendorGate.excludeFromFollowUps &&
    vendorGate.excludeFromQuotationReadiness && vendorGate.excludeFromLeadScoring && vendorGate.excludeFromSalesMetrics,
  JSON.stringify(vendorGate)
);

const vendorDecision = orchestrateWhatsAppConversationReply({
  inboundMessageText: vendorText,
  inboundMessageType: "text",
  lead: lead(),
  previousMessages: [vendorInbound],
  autoReplyEnabled: true,
  openAiEnabled: false,
  providerMessageId: vendorInbound.providerMessageId,
  intentGateDecision: vendorGate
});
check("TheBox receives the exact safe acknowledgement", vendorDecision.shouldReply && vendorDecision.replyText === expectedVendorReply, vendorDecision.replyText);
check("TheBox never receives a renovation sales template", !/dream home|property type|floor plan|renovation works/i.test(vendorDecision.replyText), vendorDecision.replyText);
check("TheBox does not invoke the sales brain", vendorDecision.blackBoxTrace.v9ProductionRouteEnabled === false && vendorDecision.replySource === "intent_gate_policy", JSON.stringify(vendorDecision.blackBoxTrace));

const priorAck = message(expectedVendorReply, "outbound", 2, {
  conversationIntent: "vendor_supplier_solicitation",
  autoReplyPolicy: "one_time_vendor_acknowledgement"
});
const repeatedVendorGate = classifyConversationIntent({
  currentMessageText: "We also provide drone photography and can share our rate card.",
  currentMessageType: "text",
  recentMessages: [vendorInbound, priorAck],
  lead: lead({ conversationIntent: "vendor_supplier_solicitation", conversationRoute: "vendor_inbox" })
});
const repeatedVendorDecision = orchestrateWhatsAppConversationReply({
  inboundMessageText: "We also provide drone photography and can share our rate card.",
  inboundMessageType: "text",
  lead: lead({ conversationIntent: "vendor_supplier_solicitation", conversationRoute: "vendor_inbox" }),
  previousMessages: [vendorInbound, priorAck],
  autoReplyEnabled: true,
  openAiEnabled: false,
  providerMessageId: "wamid.intent.inbound.3",
  intentGateDecision: repeatedVendorGate
});
check("Vendor acknowledgement is one-time", !repeatedVendorDecision.shouldReply && /already_sent/.test(repeatedVendorDecision.intentionalNoReplyReason ?? ""), repeatedVendorDecision.intentionalNoReplyReason ?? "");

const cases = [
  ["genuine_new_renovation_lead", "Hi, I need a full renovation for my 5-room HDB.", true],
  ["partnership_collaboration_outreach", "We would like to explore a referral partnership and collaborate with LIMM Works.", false],
  ["partnership_collaboration_outreach", "We want to collaborate on interior design and renovation content with LIMM Works.", false],
  ["vendor_supplier_solicitation", "We offer interior design services and would like to introduce our company.", false],
  ["recruitment_job_enquiry", "Are you hiring? I would like to send my CV for a job application.", false],
  ["spam_scam_irrelevant", "Guaranteed crypto investment return. Click link to unlock your prize.", false],
  ["wrong_number_or_general_chat", "Sorry, wrong number. Please stop messaging.", false],
  ["wrong_number_or_general_chat", "How are you? What time is it?", false],
  ["unclear_intent", "I need some help", false]
];
for (const [intent, body, eligible] of cases) {
  const result = classifyConversationIntent({ currentMessageText: body, currentMessageType: "text", recentMessages: [], lead: lead() });
  check(`${intent} taxonomy route`, result.primaryIntent === intent && result.leadEligible === eligible, JSON.stringify(result));
}

const nonPhotographyVendorText = "We offer interior design services and would like to introduce our company.";
const nonPhotographyVendorGate = classifyConversationIntent({
  currentMessageText: nonPhotographyVendorText,
  currentMessageType: "text",
  recentMessages: [],
  lead: lead()
});
check(
  "Non-photography vendors receive a relevant generic acknowledgement",
  nonPhotographyVendorGate.suggestedReply === "Thanks for reaching out and sharing your services. We’ll keep your details for future consideration."
);

const spamText = "Guaranteed crypto investment return. Click link to unlock your prize.";
const spamGate = classifyConversationIntent({ currentMessageText: spamText, currentMessageType: "text", recentMessages: [], lead: lead() });
const spamDecision = orchestrateWhatsAppConversationReply({
  inboundMessageText: spamText,
  inboundMessageType: "text",
  lead: lead(),
  previousMessages: [],
  autoReplyEnabled: true,
  openAiEnabled: false,
  intentGateDecision: spamGate
});
check("Spam/scam produces no outbound reply", !spamDecision.shouldReply && spamDecision.replyText === "" && spamDecision.unrelatedReplyBlocked, JSON.stringify(spamDecision));

const failures = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"}: ${item.name}${!item.passed && item.detail ? ` — ${item.detail}` : ""}`);
if (failures.length) process.exit(1);
console.log(`PASS: WhatsApp intent gate (${checks.length} checks).`);
