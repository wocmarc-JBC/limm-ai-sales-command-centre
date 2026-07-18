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

const {
  applySemanticDuplicateGuard,
  semanticReplySimilarity,
  SEMANTIC_DUPLICATE_REPLY_WINDOW,
  SEMANTIC_DUPLICATE_SIMILARITY_THRESHOLD
} = require(path.join(ROOT, "lib/whatsapp-conversation-safety.ts"));
const { classifyConversationIntent } = require(path.join(ROOT, "lib/whatsapp-intent-gate.ts"));
const { orchestrateWhatsAppConversationReply } = require(path.join(ROOT, "lib/whatsapp-reply-decision.ts"));

const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}

const vendorReply = "Thanks for reaching out and sharing your photography services. We’ll keep your details for future consideration.";
const nearVendorReply = "Thanks for reaching out and sharing your photography services with us. We'll keep your details for future consideration.";
check("Semantic duplicate threshold is exactly 0.85", SEMANTIC_DUPLICATE_SIMILARITY_THRESHOLD === 0.85, String(SEMANTIC_DUPLICATE_SIMILARITY_THRESHOLD));
check("Semantic duplicate window is exactly five AI replies", SEMANTIC_DUPLICATE_REPLY_WINDOW === 5, String(SEMANTIC_DUPLICATE_REPLY_WINDOW));
check("Exact normalized reply similarity is one", semanticReplySimilarity(vendorReply, vendorReply) === 1);
check("Near-paraphrase similarity reaches the guard", semanticReplySimilarity(vendorReply, nearVendorReply) >= 0.85, String(semanticReplySimilarity(vendorReply, nearVendorReply)));
check("Different replies stay below the guard", semanticReplySimilarity(vendorReply, "Could you send your floor plan and site photos?") < 0.85);

function outbound(body, index, metadata = {}) {
  return {
    id: `dedup-out-${index}`,
    leadId: "dedup-lead",
    direction: "outbound",
    channel: "whatsapp",
    body,
    safeToSend: true,
    providerMessageId: `wamid.dedup.${index}`,
    providerTimestamp: `2026-07-18T00:00:${String(index).padStart(2, "0")}.000Z`,
    whatsappStatus: "sent",
    metadata,
    createdAt: `2026-07-18T00:00:${String(index).padStart(2, "0")}.000Z`
  };
}

const directGuard = applySemanticDuplicateGuard(vendorReply, [outbound(nearVendorReply, 1)]);
check("Near-duplicate AI reply is blocked", directGuard.blocked && directGuard.highestSimilarity >= 0.85, JSON.stringify(directGuard));

const manualGuard = applySemanticDuplicateGuard(vendorReply, [outbound(vendorReply, 1, { manualReply: true })]);
check("Manual replies are not counted as prior AI replies", !manualGuard.blocked && manualGuard.comparedReplyCount === 0, JSON.stringify(manualGuard));

const oldDuplicateOutsideWindow = [
  outbound(vendorReply, 1),
  outbound("Reply one about an appointment slot.", 2),
  outbound("Reply two confirms a document was received.", 3),
  outbound("Reply three asks for the project timeline.", 4),
  outbound("Reply four acknowledges a kitchen scope.", 5),
  outbound("Reply five asks for the property address.", 6)
];
const windowGuard = applySemanticDuplicateGuard(vendorReply, oldDuplicateOutsideWindow);
check("Only the latest five AI replies are compared", !windowGuard.blocked && windowGuard.comparedReplyCount === 5, JSON.stringify(windowGuard));

const vendorText = "Hi, we provide interior photography services. Our pricing packages start from $250 and we can share our rate card.";
const lead = {
  id: "dedup-lead",
  clientName: "Vendor",
  phone: "6592222222",
  source: "WhatsApp",
  division: "LIMM Works",
  propertyType: "",
  serviceType: "conversation_pending_classification",
  scopeSummary: "",
  leadScore: 0,
  leadCategory: "Low Fit",
  status: "Not Suitable",
  missingInfo: [],
  aiRecommendedNextAction: "Route",
  bossApprovalNeeded: false,
  appointmentReadiness: 0,
  quotationReadiness: 0,
  lastClientMessage: vendorText,
  lastReplyAt: null,
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
  riskFlags: [],
  leadEligible: false,
  conversationIntent: "vendor_supplier_solicitation",
  conversationRoute: "vendor_inbox"
};
const gate = classifyConversationIntent({ currentMessageText: vendorText, currentMessageType: "text", recentMessages: [], lead });
const decision = orchestrateWhatsAppConversationReply({
  inboundMessageText: vendorText,
  inboundMessageType: "text",
  lead,
  previousMessages: [outbound(nearVendorReply, 9)],
  autoReplyEnabled: true,
  openAiEnabled: false,
  providerMessageId: "wamid.dedup.inbound",
  intentGateDecision: gate
});
check("Final reply orchestration suppresses a semantic duplicate", !decision.shouldReply && decision.semanticDuplicateBlocked, JSON.stringify(decision));
check("Duplicate suppression never rewrites to a generic sales reply", decision.replyText === "" && decision.intentionalNoReplyReason === "semantic_duplicate_reply", JSON.stringify(decision));

const failures = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"}: ${item.name}${!item.passed && item.detail ? ` — ${item.detail}` : ""}`);
if (failures.length) process.exit(1);
console.log(`PASS: reply semantic deduplication (${checks.length} checks).`);
