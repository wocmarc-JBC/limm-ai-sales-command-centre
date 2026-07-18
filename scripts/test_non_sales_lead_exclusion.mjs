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

const { determineLeadEligibility, isSalesEligibleLead } = require(path.join(ROOT, "lib/whatsapp-intent-gate.ts"));
const { buildIntentGateObservabilitySnapshot } = require(path.join(ROOT, "lib/whatsapp-intent-observability.ts"));
const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

check("Legacy leads remain eligible by default", isSalesEligibleLead({ id: "legacy" }) === true);
check("Explicit non-sales leads are excluded", isSalesEligibleLead({ id: "vendor", leadEligible: false }) === false);

const auditBase = { id: "audit", actorType: "system", actorName: "Intent Gate", entityType: "lead", entityId: "lead", summary: "", beforeData: null, afterData: null, createdAt: "2026-07-18T00:00:00.000Z" };
const metrics = buildIntentGateObservabilitySnapshot([
  { ...auditBase, id: "classified-vendor", action: "whatsapp_conversation_intent_classified", metadata: { conversationIntent: "vendor_supplier_solicitation", confidence: 0.98, leadEligible: false } },
  { ...auditBase, id: "classified-sales", action: "whatsapp_conversation_intent_classified", metadata: { conversationIntent: "genuine_new_renovation_lead", confidence: 0.97, leadEligible: true } },
  { ...auditBase, id: "manual", action: "whatsapp_conversation_routed", metadata: { manualIntentCorrection: true, previousIntent: "genuine_new_renovation_lead", requestedOverride: "vendor_supplier_solicitation" } },
  { ...auditBase, id: "safety", action: "whatsapp_conversation_safety_outcome", metadata: { conversationIntent: "vendor_supplier_solicitation", acknowledgementSent: true, semanticDuplicateBlocked: true, unrelatedReplyBlocked: true, noReplySafetySuppression: true } }
]);
check("Intent observability tracks eligible rate and intent counts", metrics.sampleSize === 2 && metrics.eligibleRatePercent === 50 && metrics.vendorCount === 1, JSON.stringify(metrics));
check("Intent observability tracks corrections and safety blocks", metrics.manualCorrections === 1 && metrics.inferredFalsePositives === 1 && metrics.duplicateRepliesBlocked === 1 && metrics.oneTimeVendorAcknowledgements === 1, JSON.stringify(metrics));

for (const intent of [
  "existing_client_project_message",
  "vendor_supplier_solicitation",
  "partnership_collaboration_outreach",
  "recruitment_job_enquiry",
  "spam_scam_irrelevant",
  "wrong_number_or_general_chat",
  "unclear_intent",
  "human_takeover_or_bot_paused",
  "existing_vendor_or_business_contact"
]) {
  const eligibility = determineLeadEligibility(intent);
  check(
    `${intent} has complete sales exclusion flags`,
    !eligibility.leadEligible && !eligibility.salesEligible && !eligibility.shouldExtractLeadFacts &&
      eligibility.excludeFromCommandCoreSales && eligibility.excludeFromMissionMap && eligibility.excludeFromFollowUps &&
      eligibility.excludeFromQuotationReadiness && eligibility.excludeFromLeadScoring && eligibility.excludeFromSalesMetrics,
    JSON.stringify(eligibility)
  );
}

const leadsRepository = read("lib/data/leads-repository.ts");
check("Lead repository excludes non-sales by default", leadsRepository.includes("!options?.includeNonSales && !isSalesEligibleLead(lead)"));
check("Lead repository offers explicit non-sales review mode", leadsRepository.includes("includeNonSales?: boolean"));
check("Quotation moves are blocked for non-sales", leadsRepository.includes("non_sales_quotation_readiness_blocked"));
check("Sales tracking is blocked for non-sales", leadsRepository.includes("non_sales_sales_tracking_blocked"));

const followupsRepository = read("lib/data/followups-repository.ts");
check("Follow-up queues exclude non-sales", followupsRepository.includes("item.lead && !isSalesEligibleLead(item.lead)"));
check("Follow-up mutations are blocked for non-sales", followupsRepository.includes("non_sales_followup_update_blocked"));
const quotationRepository = read("lib/data/quotation-repository.ts");
check("Quotation readiness mock and live joins use eligible leads", quotationRepository.includes("isSalesEligibleLead(row.lead)"));
check("Quotation readiness mutations are blocked for non-sales", quotationRepository.includes("non_sales_quotation_readiness_update_blocked"));
check(
  "Quotation package creation is blocked for non-sales",
  quotationRepository.includes("non_sales_quotation_package_blocked") &&
    quotationRepository.includes("if (!isSalesEligibleLead(input.lead))")
);
check("Quotation send gate rejects non-sales", quotationRepository.includes('missing.push("conversation is not sales eligible")'));

const inboxPage = read("app/inbox/page.tsx");
const inboxApi = read("app/api/inbox/conversations/route.ts");
check("Operator inbox explicitly includes routed non-sales conversations", inboxPage.includes("includeNonSales: true") && inboxApi.includes("includeNonSales: true"));
check("Non-sales bypasses sales lifecycle hiding only in inbox", inboxPage.includes("lead.leadEligible === false || isActiveProductionLeadForDailyScreens"));

const leadList = read("app/leads/page.tsx");
check("Lead list has a dedicated non-sales review view", leadList.includes("Non-Sales Conversations") && leadList.includes("view === \"non-sales\""));

const handler = read("lib/whatsapp-auto-reply.ts");
const routeIndex = handler.indexOf("updateConversationRouting(lead, intentGate");
const extractIndex = handler.indexOf("updateLeadFactsFromEvidence(lead");
check("Production handler routes before fact extraction", routeIndex >= 0 && extractIndex > routeIndex, `${routeIndex}:${extractIndex}`);
check("Fact extraction is eligibility-gated", handler.includes("if (intentGate.shouldExtractLeadFacts)"));

const migration = read("supabase/migrations/027_v10_2_intent_gate_conversation_safety.sql");
for (const marker of [
  "conversation_intent",
  "lead_eligible",
  "conversation_route",
  "intent_confidence",
  "intent_reason_codes",
  "intent_manual_override",
  "non_sales_acknowledged_at",
  "latest_unanswered_question",
  "conversation_safety_state",
  "leads_sales_eligible_active_idx"
]) {
  check(`Migration persists ${marker}`, migration.includes(marker));
}

const failures = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"}: ${item.name}${!item.passed && item.detail ? ` — ${item.detail}` : ""}`);
if (failures.length) process.exit(1);
console.log(`PASS: non-sales lead exclusion (${checks.length} checks).`);
