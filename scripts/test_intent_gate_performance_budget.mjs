import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
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
  assembleRecentContext,
  classifyConversationIntent,
  WHATSAPP_INTENT_CONTEXT_MESSAGE_LIMIT
} = require(path.join(ROOT, "lib/whatsapp-intent-gate.ts"));

const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}

const lead = {
  id: "perf-lead",
  clientName: "Perf",
  phone: "6595555555",
  source: "WhatsApp",
  division: "LIMM Works",
  propertyType: "",
  serviceType: "conversation_pending_classification",
  scopeSummary: "",
  leadScore: 0,
  leadCategory: "Low Fit",
  status: "Not Suitable",
  missingInfo: [],
  aiRecommendedNextAction: "Classify",
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
  conversationRoute: "intent_review"
};
const samples = [
  "Hi, I need a full renovation for my 5-room HDB.",
  "We provide interior photography services and can share our pricing packages.",
  "Are you hiring? I would like to send my CV.",
  "Guaranteed crypto return. Click link to claim your prize.",
  "We would like to explore a referral partnership.",
  "I need some help"
];

// Warm the transpiled module and JIT before measuring the deterministic rule path.
for (let index = 0; index < 100; index += 1) {
  classifyConversationIntent({ currentMessageText: samples[index % samples.length], currentMessageType: "text", recentMessages: [], lead });
}

const latencies = [];
const wallStarted = performance.now();
for (let index = 0; index < 5000; index += 1) {
  const result = classifyConversationIntent({
    currentMessageText: samples[index % samples.length],
    currentMessageType: "text",
    recentMessages: [],
    lead
  });
  latencies.push(result.classificationLatencyMs);
}
const wallElapsed = performance.now() - wallStarted;
const sorted = [...latencies].sort((a, b) => a - b);
const p95 = sorted[Math.floor(sorted.length * 0.95)];
const max = sorted.at(-1);
check("Every deterministic classification stays under 100ms", max < 100, `max=${max.toFixed(3)}ms`);
check("P95 classification has ample headroom", p95 < 20, `p95=${p95.toFixed(3)}ms`);
check("Five thousand classifications complete within the aggregate budget", wallElapsed < 5000, `wall=${wallElapsed.toFixed(3)}ms`);

const deterministic = Array.from({ length: 100 }, () => classifyConversationIntent({
  currentMessageText: samples[1],
  currentMessageType: "text",
  recentMessages: [],
  lead
}));
check(
  "Classifier output is deterministic",
  deterministic.every((item) => item.primaryIntent === deterministic[0].primaryIntent && item.confidence === deterministic[0].confidence && JSON.stringify(item.reasonCodes) === JSON.stringify(deterministic[0].reasonCodes))
);

const context = Array.from({ length: 25 }, (_, index) => ({
  id: `perf-message-${index}`,
  leadId: lead.id,
  direction: index % 2 ? "outbound" : "inbound",
  channel: "whatsapp",
  body: `Meaningful message ${index}`,
  safeToSend: index % 2 === 1,
  providerMessageId: `wamid.perf.${index}`,
  providerTimestamp: new Date(Date.parse("2026-07-18T00:00:00.000Z") + index * 1000).toISOString(),
  whatsappStatus: index % 2 ? "sent" : "received",
  metadata: {},
  createdAt: new Date(Date.parse("2026-07-18T00:00:00.000Z") + index * 1000).toISOString()
}));
const assembled = assembleRecentContext(context, 25);
check("Intent context contract is capped at ten messages", WHATSAPP_INTENT_CONTEXT_MESSAGE_LIMIT === 10 && assembled.length === 10, String(assembled.length));
check("Intent context keeps the latest meaningful messages", assembled[0]?.id === "perf-message-15" && assembled.at(-1)?.id === "perf-message-24", assembled.map((item) => item.id).join(","));

const toxicText = { toString() { throw new Error("classifier normalization failure"); } };
const failed = classifyConversationIntent({ currentMessageText: toxicText, currentMessageType: "text", recentMessages: [], lead });
check("Classifier failure is converted to safe suppression", failed.classificationFailed && failed.autoReplyPolicy === "no_auto_reply" && failed.confidence === 0, JSON.stringify(failed));
check("Classifier failure never enters the sales brain", !failed.leadEligible && failed.reasonCodes.includes("classifier_failure_safe_suppression"), JSON.stringify(failed));

const failures = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"}: ${item.name}${!item.passed && item.detail ? ` — ${item.detail}` : ""}`);
if (failures.length) process.exit(1);
console.log(`PASS: intent gate performance budget (${checks.length} checks; max ${max.toFixed(3)}ms, p95 ${p95.toFixed(3)}ms).`);
