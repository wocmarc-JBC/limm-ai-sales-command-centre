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

const { collapseHistoricalDuplicateAiMessages } = require(path.join(ROOT, "lib/inbox-message-display.ts"));
const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}

function message(id, body, seconds, direction = "outbound", metadata = {}) {
  const createdAt = new Date(Date.parse("2026-07-18T04:00:00.000Z") + seconds * 1000).toISOString();
  return {
    id,
    leadId: "display-lead",
    direction,
    channel: "whatsapp",
    body,
    safeToSend: direction === "outbound",
    providerMessageId: `wamid.${id}`,
    providerTimestamp: createdAt,
    whatsappStatus: direction === "outbound" ? "sent" : "received",
    metadata,
    createdAt
  };
}

const exactDuplicates = [
  message("ai-1", "Thanks, we will review this.", 0),
  message("ai-2", " Thanks,   we will review this. ", 3),
  message("ai-3", "Thanks, we will review this.", 6)
];
const collapsed = collapseHistoricalDuplicateAiMessages(exactDuplicates);
check("Three consecutive exact AI replies collapse to one display bubble", collapsed.length === 1, JSON.stringify(collapsed));
check("Collapsed bubble records the exact historical occurrence count", collapsed[0]?.metadata?.uiCollapsedDuplicateCount === 3, JSON.stringify(collapsed[0]?.metadata));
check("Collapsed bubble uses the newest occurrence as its visible timestamp", collapsed[0]?.id === "ai-3", collapsed[0]?.id);
check("Display collapse never mutates or deletes raw evidence", exactDuplicates.length === 3 && !exactDuplicates.some((item) => item.metadata.uiCollapsedDuplicateCount));

const separatedByInbound = collapseHistoricalDuplicateAiMessages([
  message("ai-4", "Same reply", 0),
  message("in-1", "Client follow-up", 2, "inbound"),
  message("ai-5", "Same reply", 4)
]);
check("A client inbound message resets the duplicate display run", separatedByInbound.length === 3, JSON.stringify(separatedByInbound));

const separatedByManualReply = collapseHistoricalDuplicateAiMessages([
  message("ai-6", "Same reply", 0),
  message("manual-1", "Same reply", 2, "outbound", { manualReply: true }),
  message("ai-7", "Same reply", 4)
]);
check("A manual reply is never hidden or merged into AI history", separatedByManualReply.length === 3, JSON.stringify(separatedByManualReply));

const outsideWindow = collapseHistoricalDuplicateAiMessages([
  message("ai-8", "Same reply", 0),
  message("ai-9", "Same reply", 601)
]);
check("Identical AI replies outside ten minutes remain separate", outsideWindow.length === 2, JSON.stringify(outsideWindow));

const component = fs.readFileSync(path.join(ROOT, "components/inbox/MultiChatInbox.tsx"), "utf8");
check("Inbox labels legacy conversations as not yet classified", component.includes("Legacy — not yet classified") && component.includes("Pending classification"));
check("Legacy conversations cannot generate sales AI drafts", component.includes("salesDraftingEnabled = conversation.context.intentClassified && conversation.context.leadEligible"));
check("Raw delivery details still use the uncollapsed active message array", component.includes("activeMessages.filter((message) => message.providerMessageId)"));
check("Operator can explicitly classify legacy history without sending", component.includes("reclassifyWhatsAppConversationAction"));

const failures = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"}: ${item.name}${!item.passed && item.detail ? ` — ${item.detail}` : ""}`);
if (failures.length) process.exit(1);
console.log(`PASS: inbox message safety display (${checks.length} checks).`);
