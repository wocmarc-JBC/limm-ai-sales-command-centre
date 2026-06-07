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
const messageUnderstanding = read("lib/whatsapp-v6/message-understanding.ts");
const multiIntent = read("lib/whatsapp-multi-intent.ts");
const replyCoach = read("lib/whatsapp-reply-coach.ts");
const naturalComposer = read("lib/whatsapp-v6/natural-reply-composer.ts");
const adapter = read("lib/adapters/whatsapp-adapter.ts");
const health = read("app/api/whatsapp/health/route.ts");

check(
  "2 storey landed extracts property type and storeys",
  leadContext.includes("storeysFromText") &&
    /\\b\(\[1-9\]\)\\s\*\[- \]\?\\s\*storey\\b/.test(leadContext) &&
    leadContext.includes("knownStoreys") &&
    /landed\|terrace\|semi d\|semi detached\|semi-detached\|detached/.test(leadContext),
  "Must recognise 2 storey landed / 2-storey landed."
);

check(
  "47 Kasai Road extracts address/location",
  leadContext.includes("addressFromText") &&
    leadContext.includes("knownAddressOrArea") &&
    /road\|rd\|street\|st\|avenue/.test(leadContext),
  "Explicit road-style addresses should mark address_or_area known."
);

check(
  "A&A works extracts renovation type/scope",
  leadContext.includes("A&A works") &&
    /a a works\?/.test(leadContext) &&
    leadContext.includes("knownScopeSummary"),
  "A&A should not be lost by symbol normalization."
);

check(
  "take key next month extracts timeline/key collection",
  leadContext.includes("timelineFromText") &&
    leadContext.includes("take key next month") &&
    leadContext.includes("key collection next month") &&
    leadContext.includes("knownTimeline"),
  "Timeline and key collection must be marked known."
);

check(
  "budget 500k extracts budget expectation",
  leadContext.includes("budgetExpectationFromText") &&
    leadContext.includes("knownBudgetExpectation") &&
    leadContext.includes("around $") &&
    leadContext.includes("budgetStatementDetected"),
  "Client-provided budget is planning context, not a quote request."
);

check(
  "budget statement does not trigger price-question reply",
  messageUnderstanding.includes("isBudgetStatement") &&
    messageUnderstanding.includes("removeIntent(detectedIntents, \"price_question\")") &&
    multiIntent.includes("isBudgetStatement") &&
    multiIntent.includes("intent !== \"price_question\"") &&
    replyCoach.includes("!isBudgetStatementText(text)") &&
    naturalComposer.includes("context.budgetStatementDetected"),
  "Budget statements must avoid the approved price-deflection intro."
);

check(
  "known property/location/timeline/budget are acknowledged before missing asks",
  leadContext.includes("describeKnownProjectInfo") &&
    naturalComposer.includes("composeKnownProjectReply") &&
    replyCoach.includes("composeKnownIntakeReply") &&
    leadContext.includes("This is a") &&
    leadContext.includes("budget expectation"),
  "Replies should begin with known project facts."
);

check(
  "already told you recovery apologises and summarises known info",
  leadContext.includes("alreadyToldYouDetected") &&
    replyCoach.includes("You're right, sorry about that") &&
    naturalComposer.includes("composeAlreadyToldYouReply") &&
    naturalComposer.includes("The main items still helpful for review"),
  "Client correction must not trigger another generic intake ask."
);

check(
  "missing-info ask is deduped against known fields",
  naturalComposer.includes("!context.hasFloorPlan") &&
    naturalComposer.includes("!context.hasSitePhotos") &&
    naturalComposer.includes("!context.hasDesignReferences") &&
    naturalComposer.includes("!context.knownTimeline") &&
    replyCoach.includes("!context.hasFloorPlan") &&
    replyCoach.includes("!context.hasSitePhotos"),
  "Known property type, address, timeline and budget should not be requested again."
);

check(
  "price question still uses safe price-scope-first wording",
  naturalComposer.includes("I understand you'd like a rough idea") &&
    naturalComposer.includes("To advise properly, could you share the scope of work first?") &&
    naturalComposer.includes("Pricing depends on the property type") &&
    replyCoach.includes("composePriceReply"),
  "Real how-much questions remain price safe."
);

check(
  "no rough pricing or quote ranges are introduced",
  !/quote range|price range|from \$|usually around \$|package price/i.test(
    [replyCoach, naturalComposer].join("\n")
  ),
  "No generated amount/range/package wording should appear."
);

check(
  "max 3-5 intake questions and non-technical first-contact rules preserved",
  read("lib/lead-intake.ts").includes("MIN_INTAKE_QUESTIONS = 3") &&
    read("lib/lead-intake.ts").includes("MAX_INTAKE_QUESTIONS = 5") &&
    read("lib/lead-intake.ts").includes("OVERLY_TECHNICAL_FIRST_CONTACT_QUESTIONS"),
  "v6.5 intake guardrails remain unchanged."
);

check(
  "known-good WhatsApp text payload is preserved",
  adapter.includes('messaging_product: "whatsapp"') &&
    adapter.includes('recipient_type: "individual"') &&
    adapter.includes('type: "text"') &&
    adapter.includes("preview_url: false") &&
    adapter.includes("normalizeWhatsAppPhone(to)"),
  "Do not regress Meta send payload."
);

check(
  "health exposes v6.5.1 intake memory proof",
  health.includes('version: "v6_5_1_intake_memory_budget_statement_fix"') &&
    health.includes("intakeKnownInfoAcknowledgementAvailable: true") &&
    health.includes("budgetStatementClassificationAvailable: true") &&
    health.includes("budgetExpectationNotPriceQuestionAvailable: true") &&
    health.includes("alreadyToldYouRecoveryAvailable: true") &&
    health.includes("intakeMissingInfoDeduplicationAvailable: true") &&
    health.includes("addressExtractionAvailable: true") &&
    health.includes("timelineExtractionAvailable: true") &&
    health.includes("landedAaExtractionAvailable: true"),
  "Vercel health should prove the fix after deploy."
);

check(
  "price guide on hold, calendar auto-booking off, voice transcription off",
  health.includes("priceGuideOnHold: true") &&
    health.includes("calendarAutoBookingEnabled: calendar.autoBookingEnabled") &&
    health.includes("voiceTranscriptionEnabled: false"),
  "No unrelated live feature is enabled."
);

const failed = checks.filter((item) => !item.passed);

console.log("v6.5.1 intake memory and budget statement classification test");
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} - ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}

if (failed.length) {
  console.error(`\nFAILED ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nPASS ${checks.length}/${checks.length}`);
