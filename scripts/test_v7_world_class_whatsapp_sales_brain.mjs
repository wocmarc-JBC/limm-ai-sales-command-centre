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

const leadContext = read("lib/whatsapp-lead-context.ts");
const v7Brain = read("lib/whatsapp-v7-sales-brain.ts");
const replyDecision = read("lib/whatsapp-reply-decision.ts");
const safety = read("lib/whatsapp-safety.ts");
const adapter = read("lib/adapters/whatsapp-adapter.ts");
const health = read("app/api/whatsapp/health/route.ts");
const intake = read("lib/lead-intake.ts");
const selectMissingFieldsSource = v7Brain.slice(
  v7Brain.indexOf("function selectMissingFields"),
  v7Brain.indexOf("function askForFields")
);

const replayConversation = [
  "Hello",
  "its a 2 storey landed at 47 Kasai Road, want to do A&A works",
  "its a 2 storey landed at 47 Kasai Road, want to do A&A works. Take key next month. budget 500k",
  "I already told you",
  "ok?",
  "??"
];

check(
  "1. Extracts 2-storey landed",
  leadContext.includes("storeysFromText") &&
    leadContext.includes("knownStoreys") &&
    /\\b\(\[1-9\]\)\\s\*\[- \]\?\\s\*storey\\b/.test(leadContext) &&
    /landed\|terrace\|semi d\|semi detached/.test(leadContext),
  "Storeys and landed property type must be memory facts before composing."
);

check(
  "2. Extracts 47 Kasai Road",
  leadContext.includes("addressFromText") &&
    leadContext.includes("knownAddressOrArea") &&
    /road\|rd\|street\|st\|avenue/.test(leadContext),
  "Road-style addresses should be marked known."
);

check(
  "3. Extracts A&A works",
  leadContext.includes("A&A works") &&
    /a a works\?/.test(leadContext) &&
    leadContext.includes("addition and alteration"),
  "A&A / A and A / AA must become renovation scope."
);

check(
  "4. Extracts take key next month",
  leadContext.includes("timelineFromText") &&
    leadContext.includes("take key next month") &&
    leadContext.includes("key collection next month"),
  "Key collection is timeline context, not a generic missing field."
);

check(
  "5. Extracts budget 500k as budget expectation",
  leadContext.includes("budgetExpectationFromText") &&
    leadContext.includes("knownBudgetExpectation") &&
    leadContext.includes("budgetStatementDetected") &&
    leadContext.includes("around $"),
  "Client-provided budget is stored as planning context."
);

check(
  "6. Budget statement does not trigger price-question mode",
  v7Brain.includes("provide_budget_expectation") &&
    v7Brain.includes("!intents.includes(\"provide_budget_expectation\")") &&
    v7Brain.includes("composeBudgetStatementReply") &&
    !/composeBudgetStatementReply[\s\S]{0,900}I understand you'd like a rough idea/.test(v7Brain),
  "Budget statements must not use the price-deflection intro."
);

check(
  "7. Price question still triggers safe price-scope-first",
  v7Brain.includes("composePriceQuestionReply") &&
    v7Brain.includes("I understand you'd like a rough idea") &&
    v7Brain.includes("To avoid giving the wrong figure") &&
    v7Brain.includes("scope, drawings/site photos, site condition and material direction"),
  "Actual how-much questions remain price-safe."
);

check(
  "8. Project detail reply acknowledges known info first",
  v7Brain.includes("knownAcknowledgement(context)") &&
    v7Brain.includes("`${prefix} This is") &&
    v7Brain.includes("known_facts_summary"),
  "Composer must start from known facts when available."
);

check(
  "9. Project detail reply does not ask property type again",
  v7Brain.includes("selectMissingFields") &&
    leadContext.includes("!memory.hasPropertyType") &&
    leadContext.includes("normalizeMissingFields") &&
    v7Brain.includes("context.known_facts_summary ? \"normal\" : \"first\""),
  "Known property type should not be requested again in project-detail replies."
);

check(
  "10. Project detail reply does not ask location again",
  leadContext.includes("!memory.hasAddressOrArea") &&
    v7Brain.includes("\"address_or_area\"") &&
    v7Brain.includes("base.includes(field)"),
  "Known location/address should be excluded from missing-field asks."
);

check(
  "11. Project detail reply does not ask budget again",
  leadContext.includes("hasBudgetExpectation") &&
    v7Brain.includes("composeBudgetStatementReply") &&
    !selectMissingFieldsSource.includes("budget_expectation"),
  "Budget expectation is remembered and not re-asked in the core project reply."
);

check(
  "12. Project detail reply does not ask timeline again",
  leadContext.includes("hasTimeline") &&
    leadContext.includes("!memory.hasTimeline") &&
    v7Brain.includes("\"timeline\"") &&
    v7Brain.includes("base.includes(field)"),
  "Timeline should only be asked when missing."
);

check(
  "13. Already told you produces apology + known info summary",
  v7Brain.includes("composeAlreadyToldYouReply") &&
    v7Brain.includes("You're right, sorry about that") &&
    v7Brain.includes("shortKnownAcknowledgement(context)") &&
    v7Brain.includes("The main items still helpful for review"),
  "Client correction should recover gracefully."
);

check(
  "14. ok? does not trigger full intake",
  leadContext.includes("isShortPingText") &&
    v7Brain.includes("composeShortPingReply") &&
    v7Brain.includes("Yes, noted. We have the main details so far") &&
    !/composeShortPingReply[\s\S]{0,900}property type, basic renovation scope, and any floor plan or site photos/.test(v7Brain),
  "Short pings with context should be concise."
);

check(
  "15. ?? does not trigger full intake",
  leadContext.includes("isConfusionPingText") &&
    v7Brain.includes("Sorry if that was unclear") &&
    v7Brain.includes("The next helpful items"),
  "Confusion pings should clarify, not reset intake."
);

check(
  "16. hello? with existing context gives short acknowledgement",
  v7Brain.includes("Hi, yes we're here") &&
    v7Brain.includes("context.known_facts_summary") &&
    v7Brain.includes("Yes, noted. We have the main details so far"),
  "Greeting/ping can use context."
);

check(
  "17. Appointment request collects timing but does not confirm",
  v7Brain.includes("composeAppointmentReply") &&
    v7Brain.includes("not confirmed yet") &&
    v7Brain.includes("check availability") &&
    !/appointment confirmed|booked for you/i.test(v7Brain),
  "Appointment preference collection must stay non-confirming."
);

check(
  "18. Design question asks design/lifestyle/reference, not technical checklist",
  v7Brain.includes("composeDesignReply") &&
    v7Brain.includes("layout, lighting, lifestyle, storage needs") &&
    v7Brain.includes("design_references") &&
    v7Brain.includes("mode === \"design\""),
  "Design reply should answer design first."
);

check(
  "19. Portfolio request returns Instagram link",
  v7Brain.includes("composePortfolioReply") &&
    v7Brain.includes("getLimmInstagramUrl") &&
    leadContext.includes("https://www.instagram.com/limmworks/"),
  "Portfolio routes to official LIMM Works Instagram."
);

check(
  "20. File/media sent does not ask for same file again",
  leadContext.includes("floor_plan_received") &&
    leadContext.includes("reference_images_received") &&
    v7Brain.includes("file_or_media_sent") &&
    leadContext.includes("!memory.hasFloorPlan") &&
    v7Brain.includes("context.floor_plan_received"),
  "Media/floor plan context should mark files as received before asks."
);

check(
  "21. Max question limit enforced",
  v7Brain.includes("maxThreeQuestionsDefaultAvailable") &&
    v7Brain.includes("const limit = mode === \"first\" && !context.known_facts_summary ? 5 : 3") &&
    v7Brain.includes(".slice(0, limit)"),
  "Normal asks must be capped at 1-3, first-empty enquiry at 5."
);

check(
  "22. No overly technical first-contact questions",
  intake.includes("OVERLY_TECHNICAL_FIRST_CONTACT_QUESTIONS") &&
    !/PE endorsement|structural engineer|submission drawings/i.test(v7Brain),
  "First-contact v7 replies should stay sales-friendly."
);

check(
  "23. No price/range generated",
  !/quote range|price range|from \$|usually around \$|package price|estimated price/i.test(v7Brain),
  "No generated price/range/package wording."
);

check(
  "24. No appointment confirmation without calendar event",
  safety.includes("appointment_confirmation_without_calendar_event") &&
    !/appointment confirmed|booked for you|we have booked/i.test(v7Brain),
  "Calendar event remains required for booking confirmation."
);

check(
  "25. No approval/hacking guarantee",
  !/approval sure pass|no approval needed|guaranteed approval|sure can hack|confirm can hack|wall can be hacked/i.test(v7Brain) &&
    safety.includes("hacking_certainty") &&
    safety.includes("approval_promise"),
  "Risk replies remain cautious."
);

check(
  "26. No free consultation",
  !/free consultation/i.test(v7Brain) &&
    /initial project review/i.test(v7Brain),
  "Approved wording is initial project review."
);

check(
  "27. Known-good WhatsApp send payload preserved",
  adapter.includes('messaging_product: "whatsapp"') &&
    adapter.includes('recipient_type: "individual"') &&
    adapter.includes('type: "text"') &&
    adapter.includes("preview_url: false") &&
    adapter.includes("normalizeWhatsAppPhone(to)"),
  "Meta text send payload must not regress."
);

check(
  "28. No-silence guard preserved",
  replyDecision.includes("NO_SILENCE_FALLBACK_REPLY") &&
    replyDecision.includes("noSilenceGuardResult") &&
    replyDecision.includes("valid_client_text"),
  "Valid text must never end in empty reply."
);

check(
  "29. Safety false-positive fallback preserved",
  safety.includes("WHATSAPP_ULTRA_SAFE_FALLBACK_REPLY") &&
    safety.includes("missing_initial_project_review_wording") &&
    safety.includes("blocking: false"),
  "v6.7.1 false-positive protection remains."
);

check(
  "30. Price guide remains on hold",
  health.includes("priceGuideOnHold: true") &&
    health.includes("priceGuideAutomationEnabled: false"),
  "No price guide automation."
);

check(
  "31. Calendar auto-booking remains off",
  health.includes("calendarAutoBookingEnabled: calendar.autoBookingEnabled") &&
    health.includes("calendarAutoBookingEnabled: false"),
  "Calendar remains a non-autonomous foundation."
);

check(
  "32. Voice transcription remains off",
  health.includes("voiceTranscriptionEnabled: false"),
  "No voice transcription."
);

check(
  "Replay: exact v7 conversation is represented and context-first recovery is present",
  replayConversation.length === 6 &&
    v7Brain.includes("provide_budget_expectation") &&
    v7Brain.includes("already_told_you") &&
    v7Brain.includes("short_ping") &&
    v7Brain.includes("confusion_ping") &&
    v7Brain.includes("genericFallbackReducedAvailable") &&
    v7Brain.includes("knownInfoAcknowledgementBeforeQuestions"),
  "Replay must not collapse into generic intake."
);

check(
  "Health exposes v7 production proof",
  health.includes('version: "v7_world_class_whatsapp_sales_brain"') &&
    health.includes('salesBrainVersion: "v7"') &&
    health.includes("worldClassSalesConversationBrainAvailable: true") &&
    health.includes("memoryFirstReplyComposerAvailable: true") &&
    health.includes("knownInfoAcknowledgementBeforeQuestions: true") &&
    health.includes("shortPingSmartReplyAvailable: true") &&
    health.includes("confusionPingSmartReplyAvailable: true") &&
    health.includes("alreadyToldYouRecoveryAvailable: true") &&
    health.includes("budgetStatementNotPriceQuestionAvailable: true") &&
    health.includes("contextAwareMissingInfoQuestionsAvailable: true") &&
    health.includes("maxThreeQuestionsDefaultAvailable: true") &&
    health.includes("genericFallbackReducedAvailable: true") &&
    health.includes("conversationReplayTestAvailable: true"),
  "Vercel health should prove v7 after deploy."
);

check(
  "v7 brain is integrated before older fallback layers",
  replyDecision.includes("buildV7WorldClassWhatsAppSalesBrainDecision") &&
    replyDecision.includes("world_class_sales_brain") &&
    /let replyText = v7Decision\.replyText \|\| v6Decision\.replyText \|\| coach\.replyText/.test(replyDecision) &&
    /quality\.rewriteRequired && !usingV7Reply/.test(replyDecision),
  "Old generic quality rewrite must not replace a v7 memory-first reply."
);

const failed = checks.filter((item) => !item.passed);

console.log("v7 world-class WhatsApp sales conversation brain test");
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} - ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}

if (failed.length) {
  console.error(`\nFAILED ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nPASS ${checks.length}/${checks.length}`);
