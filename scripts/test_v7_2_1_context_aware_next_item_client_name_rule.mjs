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
const health = read("app/api/whatsapp/health/route.ts");
const adapter = read("lib/adapters/whatsapp-adapter.ts");
const safety = read("lib/whatsapp-safety.ts");
const decision = read("lib/whatsapp-reply-decision.ts");
const replyReturnLiterals = [...v7.matchAll(/return\s+(`[^`]*`|"[^"]*"|'[^']*')/g)]
  .map((match) => match[1])
  .join("\n");
const activePlannerComposer = v7.slice(
  v7.indexOf("export function composeReplyFromPlan"),
  v7.indexOf("export function judgeHumanFeel")
);
const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";

check(
  "1. v7.2.1 version marker exists",
  v7.includes('V7_2_1_CONTEXT_AWARE_NEXT_ITEM_VERSION = "v7_2_1_context_aware_next_item_client_name_rule"') &&
    health.includes('version: "v7_2_1_context_aware_next_item_client_name_rule"') &&
    health.includes('salesBrainVersion: "v7.2.1"'),
  "Health must prove v7.2.1 after deploy."
);

check(
  "2. portfolio request after floor plan received does not ask for floor plan again",
  v7.includes("if (context.floor_plan_received)") &&
    v7.includes("We've received your floor plan, so site photos or design references would be useful if available.") &&
    !/route_to_portfolio[\s\S]{0,900}send your floor plan or site photos/.test(v7),
  "Portfolio branch must use file context."
);

check(
  "3. portfolio request still sends Instagram link directly",
  v7.includes("if (primaryMove === \"route_to_portfolio\") return `You can view some of our past works here: ${getLimmInstagramUrl()}`") &&
    v7.includes("return `${plan.directAnswer}${tailored}`"),
  "Instagram must be the first direct answer."
);

check(
  "4. price after serious landed A&A + floor plan received does not ask broad scope",
  v7.includes("if (primaryMove === \"safe_price_reply\" && isSeriousLandedAa(context))") &&
    v7.includes("context.floor_plan_received") &&
    /if \(isSeriousLandedAa\(context\)\) \{[\s\S]{0,260}nextUsefulFileLine\(context, "price"\)[\s\S]{0,180}return `\$\{plan\.directAnswer\}\\n\\n\$\{next\}`;/.test(activePlannerComposer),
  "Serious landed A&A already has scope context."
);

check(
  "5. price after serious landed A&A + floor plan received asks next useful file context",
  v7.includes("nextUsefulFileLine(context, \"price\")") &&
    v7.includes("site photos or design references would be useful if available"),
  "Next item should be site photos/design references after floor plan."
);

check(
  "6. price gives no amount/range/from/package",
  !/quote range|price range|from \$|usually around \$|package price|estimated price|rough estimate/i.test(replyReturnLiterals.replace(/budget expectation around \$500k/g, "budget expectation")) &&
    safety.includes("pricing_amount"),
  "No generated price amounts."
);

check(
  "7. greeting with known context starts naturally",
  v7.includes("Hi, yes we're here. We have your ${knownShort} noted.") &&
    !/if \(\/\^\\s\*\(hello\|hi\|hey\)[\s\S]{0,350}Yes, noted/.test(v7),
  "Known-context greeting should not start as a dry acknowledgement."
);

check(
  "8. greeting with no context asks broad basics",
  v7.includes("Hi, yes we're here. Could you share the property type, what kind of renovation you're planning, and whether you have a floor plan or site photos available?"),
  "Fresh greeting remains helpful."
);

check(
  "9. serious landed A&A + floor plan received moves toward review readiness",
  v7.includes("function isReviewReadySeriousLandedAa") &&
    v7.includes("We have enough key details for the team to start reviewing") &&
    v7.includes("The team can already review the floor plan"),
  "Review-ready leads should stop endless intake."
);

check(
  "10. received floor plan is not asked again in missing next items",
  v7.includes("if (field === \"floor_plan\") return context.floor_plan_received") &&
    v7.includes(".filter((field) => !fieldAlreadyKnown(context, field))"),
  "Known floor plan must be filtered."
);

check(
  "11. received site photos are not asked again",
  v7.includes("if (field === \"site_photos\") return context.site_photos_received"),
  "Known site photos must be filtered."
);

check(
  "12. received design references are not asked again",
  v7.includes("if (field === \"design_references\") return context.reference_images_received"),
  "Known references must be filtered."
);

check(
  "13. serious landed A&A does not ask broad scope/main areas by default",
  v7.includes("!(isSeriousLandedAa(context) && field === \"scope\")") &&
    v7.includes("serious_landed_aa_asked_main_areas") &&
    !/isSeriousLandedAa[\s\S]{0,1200}main areas involved/i.test(v7),
  "No broad scope/main areas for serious landed A&A."
);

check(
  "14. client name is not asked if lead/profile name exists",
  v7.includes("function hasUsableClientName") &&
    v7.includes("input.lead.clientName") &&
    v7.includes("whatsappProfileNameFromHistory") &&
    v7.includes("clientNameKnown: hasClientName"),
  "Existing lead/profile name prevents name ask."
);

check(
  "15. client name is asked politely if unknown and review/meeting-ready",
  v7.includes("shouldAskClientName") &&
    v7.includes("May I also have your name so the team can record the enquiry properly?") &&
    v7.includes("leadStage === \"meeting_ready\""),
  "Name prompt should be low-friction and context-aware."
);

check(
  "16. client name is not asked before answering direct question",
  v7.includes("finalisePlannerReply(composeReplyFromPlan") &&
    v7.includes("withClientNamePrompt") &&
    v7.includes("plan.directAnswer"),
  "Name prompt is appended after composed/direct reply."
);

check(
  "17. client name is not asked when annoyed/confused",
  v7.includes("patience === \"normal\"") &&
    v7.includes('"clarify_confusion", "recover_from_mistake", "greet", "simple_acknowledgement"'),
  "Patience and recovery branches should suppress name ask."
);

check(
  "18. initial project review is not repeated twice",
  v7.includes("function dedupeInitialProjectReview") &&
    v7.includes("return \"project review\""),
  "Finalizer dedupes repeated phrase."
);

check(
  "19. v7.2 single planner path preserved",
  v7.includes("planWhatsAppSalesReply(input)") &&
    v7.includes("composeReplyFromPlan") &&
    v7.includes("judgeHumanFeel") &&
    !/buildV7WorldClassWhatsAppSalesBrainDecision[\s\S]{0,900}composeReply\(input/.test(v7),
  "v7.2 architecture must remain intact."
);

check(
  "20. known-good WhatsApp payload preserved",
  adapter.includes('messaging_product: "whatsapp"') &&
    adapter.includes('recipient_type: "individual"') &&
    adapter.includes('type: "text"') &&
    adapter.includes("preview_url: false") &&
    adapter.includes("normalizeWhatsAppPhone(to)") &&
    !adapter.includes(wrongWhatsAppPhoneNumberId),
  "Meta send payload contract unchanged."
);

check(
  "21. price guide remains on hold",
  health.includes("priceGuideOnHold: true") &&
    health.includes("priceGuideAutomationEnabled: false"),
  "No price guide automation."
);

check(
  "22. calendar auto-booking remains off",
  health.includes("calendarAutoBookingEnabled: calendar.autoBookingEnabled") &&
    health.includes("calendarAutoBookingEnabled: false"),
  "Calendar stays non-autonomous."
);

check(
  "23. voice transcription remains off",
  health.includes("voiceTranscriptionEnabled: false") &&
    decision.includes("voiceTranscriptionAttempted: false"),
  "No voice transcription."
);

check(
  "24. health exposes v7.2.1 proof fields",
  health.includes("contextAwareNextUsefulItemAvailable: true") &&
    health.includes("portfolioReplyUsesFileContext: true") &&
    health.includes("priceReplyUsesKnownProjectContext: true") &&
    health.includes("greetingKnownContextNatural: true") &&
    health.includes("clientNameRuleAvailable: true") &&
    health.includes("reviewReadyStopAskingRefinementAvailable: true") &&
    health.includes("receivedFilesNotAskedAgain: true") &&
    health.includes("seriousLandedAaNoBroadScopeAsk: true"),
  "Production health should show the surgical refinement."
);

const failed = checks.filter((item) => !item.passed);

console.log("v7.2.1 context-aware next useful item + client name rule test");
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} - ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}

if (failed.length) {
  console.error(`\nFAILED ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nPASS ${checks.length}/${checks.length}`);
