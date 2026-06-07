import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const checks = [];

function check(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}

const v7 = read("lib/whatsapp-v7-sales-brain.ts");
const decision = read("lib/whatsapp-reply-decision.ts");
const health = read("app/api/whatsapp/health/route.ts");
const adapter = read("lib/adapters/whatsapp-adapter.ts");
const replyReturnLiterals = [...v7.matchAll(/return\s+(`[^`]*`|"[^"]*"|'[^']*')/g)]
  .map((match) => match[1])
  .join("\n");
const activePlannerComposer = v7.slice(
  v7.indexOf("export function composeReplyFromPlan"),
  v7.indexOf("export function judgeHumanFeel")
);
const decisionSelector = decision.slice(
  decision.indexOf("export function buildWhatsAppReplyDecision"),
  decision.length
);
const safeRewrite = decision.slice(
  decision.indexOf("function safeRewriteFor"),
  decision.indexOf("export function buildWhatsAppReplyDecision")
);
const legacyPatterns = [
  /Giving a rough figure too early can be misleading/i,
  /To avoid giving (?:you )?the wrong figure/i,
  /Could you share the scope of work/i,
  /Could you share main renovation scope/i,
  /WhatsApp renovation enquiry pending review/i,
  /This is a at/i,
  /This is with/i
];
const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";

check(
  "1. v7.2.3 health marker exists",
  v7.includes('V7_2_3_LEGACY_TEMPLATE_REMOVAL_VERSION = "v7_2_3_remove_legacy_whatsapp_reply_templates"') &&
    health.includes('version: "v7_2_3_remove_legacy_whatsapp_reply_templates"') &&
    health.includes('salesBrainVersion: "v7.2.3"'),
  "Production health must prove v7.2.3."
);

check(
  "2. live selector uses v7 planner first and ultra-safe fallback only",
  decisionSelector.includes("let replyText = usingV7Reply ? v7Decision.replyText : ULTRA_SAFE_MINIMAL_FALLBACK_REPLY") &&
    !decisionSelector.includes("v7Decision.replyText || v6Decision.replyText || coach.replyText") &&
    !decisionSelector.includes("? \"world_class_sales_brain\"\n    : v6Decision.replyText"),
  "v6/coach/question-bank templates must not become final live client replies."
);

check(
  "3. final reply trace exposes source and template blocking",
  decisionSelector.includes("replyEngine: usingV7Reply ? \"v7_2_planner\" : \"ultra_safe_fallback\"") &&
    decisionSelector.includes("primaryMove: v7Decision.salesMove") &&
    decisionSelector.includes("templateId") &&
    decisionSelector.includes("usedPlanner: usingV7Reply") &&
    decisionSelector.includes("blockedLegacyTemplate"),
  "Marcus needs proof of which engine/template made the reply."
);

check(
  "4. final legacy-template blocker exists",
  decision.includes("function containsLegacyReplyTemplate") &&
    decisionSelector.includes("if (containsLegacyReplyTemplate(replyText))") &&
    decisionSelector.includes("blocked_legacy_template_ultra_safe_fallback"),
  "Old template strings must be blocked before final send."
);

check(
  "5. safe rewrite path cannot reintroduce old price template",
  !legacyPatterns.some((pattern) => pattern.test(safeRewrite)) &&
    safeRewrite.includes("The team needs to review the project details, site condition and material direction first before advising"),
  "Safety/quality fallback must not use legacy price wording."
);

check(
  "6. v7 generated reply literals do not contain legacy client phrases",
  !legacyPatterns.some((pattern) => pattern.test(replyReturnLiterals)),
  "v7 client-facing return literals should not contain legacy templates."
);

check(
  "7. active v7 price composer does not contain legacy phrases",
  !legacyPatterns.some((pattern) => pattern.test(activePlannerComposer)),
  "The active single reply planner composer must be clean."
);

check(
  "8. exact serious landed A&A + floor plan price case uses known context",
  activePlannerComposer.includes("if (shouldUseKnownLandedAaPriceContext(context))") &&
    v7.includes("I understand you'd like a rough idea. For landed A&A works, the team should review the floor plan, site photos, site condition and material direction first before advising.") &&
    v7.includes("We've received the floor plan, so site photos and any design references would be useful next.") &&
    v7.includes("priceReplyNoScopeAskForSeriousAa: true"),
  "Known A&A + floor plan should ask site photos/references, not scope/floor plan."
);

check(
  "9. price still gives no amount/range/from/package",
  !/quote range|price range|from \$|usually around \$|package price|estimated price|rough estimate/i.test(replyReturnLiterals.replace(/budget expectation around \$500k/g, "budget expectation")),
  "No generated price amounts or ranges."
);

check(
  "10. health exposes v7.2.3 safety proof",
  health.includes("legacyReplyTemplatesRemovedFromLivePath: true") &&
    health.includes("replySourceTraceAvailable: true") &&
    health.includes("legacyTemplateBlockedInFinalReplies: true") &&
    health.includes("priceReplyUsesV72PlannerOnly: true") &&
    health.includes("priceReplyNoScopeAskForSeriousAa: true") &&
    health.includes("priceGuideOnHold: true") &&
    health.includes("calendarAutoBookingEnabled: calendar.autoBookingEnabled") &&
    health.includes("voiceTranscriptionEnabled: false"),
  "Health must prove the live guardrails."
);

check(
  "11. known-good WhatsApp payload preserved",
  adapter.includes('messaging_product: "whatsapp"') &&
    adapter.includes('recipient_type: "individual"') &&
    adapter.includes('type: "text"') &&
    adapter.includes("preview_url: false") &&
    adapter.includes("normalizeWhatsAppPhone(to)") &&
    !adapter.includes(wrongWhatsAppPhoneNumberId),
  "Meta send payload contract must remain unchanged."
);

const failed = checks.filter((item) => !item.passed);

console.log("v7.2.3 legacy WhatsApp reply template removal test");
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} - ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}

if (failed.length) {
  console.error(`\nFAILED ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nPASS ${checks.length}/${checks.length}`);
