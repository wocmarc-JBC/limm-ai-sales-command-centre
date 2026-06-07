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

const context = read("lib/whatsapp-lead-context.ts");
const v7 = read("lib/whatsapp-v7-sales-brain.ts");
const decision = read("lib/whatsapp-reply-decision.ts");
const safety = read("lib/whatsapp-safety.ts");
const adapter = read("lib/adapters/whatsapp-adapter.ts");
const health = read("app/api/whatsapp/health/route.ts");

check(
  "1. internal placeholder is never client-facing",
  context.includes("INTERNAL_PLACEHOLDER_PATTERNS") &&
    context.includes("isInternalClientFacingPlaceholder") &&
    context.includes("cleanClientFacingText") &&
    v7.includes("internalPlaceholderNeverClientFacing: true"),
  "Internal CRM fallback labels must be filtered before summary/reply composition."
);

check(
  "2. WhatsApp renovation enquiry pending review never appears in reply text",
  context.includes("whatsapp renovation enquiry pending review") &&
    context.includes("cleanClientFacingText(input.lead.scopeSummary)") &&
    !/replyText[\s\S]{0,600}WhatsApp renovation enquiry pending review/.test(v7),
  "Placeholder may exist only as a blocked pattern/source fixture, not in generated reply text."
);

check(
  "3. address-only message produces clean reply, no This is a at",
  v7.includes("hasOnlyAddress") &&
    v7.includes("Thanks, noted -") &&
    !/This is a at/i.test(v7 + context),
  "Address-only context should reply with a clean address acknowledgement."
);

check(
  "4. 2-storey landed + address + A&A produces clean known summary",
  context.includes("buildClientFacingKnownSummary") &&
    context.includes("storeysFromText") &&
    context.includes("${match[1]}-storey") &&
    context.includes("A&A works") &&
    v7.includes("This is a ${summary}"),
  "Known summary must support: 2-storey landed property at address, with A&A works."
);

check(
  "5. A&A works replaces pending review placeholder",
  /function scopeFromText[\s\S]*scopeMatch[\s\S]*A&A works[\s\S]*cleanClientFacingText\(lead\.scopeSummary\)/.test(context) &&
    !/if \(lead\.scopeSummary[\s\S]{0,120}return lead\.scopeSummary/.test(context),
  "Latest explicit A&A text must beat the lead fallback scope."
);

check(
  "6. budget 500k remains budget expectation, not price question",
  v7.includes("provide_budget_expectation") &&
    v7.includes("!intents.includes(\"provide_budget_expectation\")") &&
    context.includes("budgetExpectationFromText") &&
    safety.includes("pricingAmountOnlyAppearsAsClientBudgetExpectation"),
  "Budget statements are client expectation context, not a generated quote."
);

check(
  "7. follow-up ok? uses known context and no generic intake",
  context.includes("isShortPingText") &&
    !/ok\\\?/.test(context.match(/function isConfusionPingText[\s\S]*?\n}/)?.[0] ?? "") &&
    v7.includes("Yes, noted. We have the main details so far:") &&
    v7.includes("The next helpful items are the"),
  "ok? should acknowledge, not apologize."
);

check(
  "8. ?? uses clarification but no full intake",
  context.includes("isConfusionPingText") &&
    v7.includes("Sorry if that was unclear") &&
    !/Sorry if that was unclear[\s\S]{0,700}property type, basic renovation scope/.test(v7),
  "?? should clarify briefly without resetting intake."
);

check(
  "9. can you see the floorplan i send you triggers file_status_question",
  v7.includes("file_status_question") &&
    v7.includes("floorplan_status_question") &&
    /can you see\|did you receive\|did you get\|you received/.test(v7) &&
    /floor\\s\*plan\|floorplan\|file\|photo\|image\|document/.test(v7),
  "File receipt questions need a distinct intent."
);

check(
  "10. floorplan status reply answers the question",
  v7.includes("composeFileStatusReply") &&
    v7.includes("Yes, we've received the floor plan") &&
    v7.includes("I don't see the floor plan confirmed on our side yet"),
  "Reply must answer receipt status directly."
);

check(
  "11. file-status reply does not ask property/address again",
  !/composeFileStatusReply[\s\S]{0,900}property type|composeFileStatusReply[\s\S]{0,900}property area\/address/.test(v7),
  "File-status replies must not ask known address/property again."
);

check(
  "12. known address persists across later messages",
  context.includes("previousText") &&
    context.includes("input.lead.projectAddress") &&
    context.includes("memory.knownAddressOrArea") &&
    v7.includes("knownContextPersistenceAcrossReplies: true"),
  "Merged context must include previous messages and lead fields."
);

check(
  "13. known property type persists across later messages",
  context.includes("propertyTypeFromText") &&
    context.includes("input.lead.propertyType") &&
    context.includes("context.property_type"),
  "Property type is merged from lead/history/latest text."
);

check(
  "14. known timeline persists across later messages",
  context.includes("timelineFromText") &&
    context.includes("input.lead.intakeProfile?.timeline") &&
    context.includes("memory.knownTimeline"),
  "Timeline is merged and does not disappear after pings."
);

check(
  "15. known budget persists across later messages",
  context.includes("input.lead.intakeProfile?.budgetExpectation") &&
    context.includes("memory.knownBudgetExpectation") &&
    context.includes("budget_expectation"),
  "Budget expectation is merged context."
);

check(
  "16. missing-info selector does not ask known fields",
  context.includes("normalizeMissingFields") &&
    context.includes("!memory.hasPropertyType") &&
    context.includes("!memory.hasAddressOrArea") &&
    context.includes("!memory.hasTimeline") &&
    v7.includes("base.includes(field)"),
  "Missing field selector must receive merged known facts."
);

check(
  "17. buildClientFacingKnownSummary removes internal placeholders",
  context.includes("buildClientFacingKnownSummary") &&
    context.includes("cleanClientFacingText(context.scope_summary)") &&
    context.includes("knownFactsSummary"),
  "Known summary must be client-facing only."
);

check(
  "18. max 1-3 missing questions for context-known replies",
  v7.includes("const limit = mode === \"first\" && !context.known_facts_summary ? 5 : 3") &&
    v7.includes(".slice(0, limit)") &&
    v7.includes("maxThreeQuestionsDefaultAvailable: true"),
  "Context-known replies stay focused."
);

check(
  "19. price question still safe and no price/range",
  v7.includes("I understand you'd like a rough idea") &&
    v7.includes("To avoid giving the wrong figure") &&
    !/quote range|price range|from \$|usually around \$|package price|estimated price/i.test(v7),
  "No generated pricing."
);

check(
  "20. appointment request still not confirmed without calendar",
  v7.includes("not confirmed yet") &&
    safety.includes("appointment_confirmation_without_calendar_event") &&
    !/appointment confirmed|booked for you|we have booked/i.test(v7),
  "Appointment stays availability-check only."
);

check(
  "21. no-silence guard preserved",
  decision.includes("NO_SILENCE_FALLBACK_REPLY") &&
    decision.includes("noSilenceGuardResult") &&
    decision.includes("valid_client_text"),
  "No-silence remains in the final decision path."
);

check(
  "22. known-good WhatsApp payload preserved",
  adapter.includes('messaging_product: "whatsapp"') &&
    adapter.includes('recipient_type: "individual"') &&
    adapter.includes('type: "text"') &&
    adapter.includes("preview_url: false") &&
    adapter.includes("normalizeWhatsAppPhone(to)"),
  "Meta payload contract must not change."
);

check(
  "23. priceGuideOnHold true",
  health.includes("priceGuideOnHold: true") &&
    health.includes("priceGuideAutomationEnabled: false"),
  "Price guide remains on hold."
);

check(
  "24. calendarAutoBookingEnabled false",
  health.includes("calendarAutoBookingEnabled: calendar.autoBookingEnabled") &&
    health.includes("calendarAutoBookingEnabled: false"),
  "Calendar auto-booking remains off."
);

check(
  "25. voiceTranscriptionEnabled false",
  health.includes("voiceTranscriptionEnabled: false"),
  "Voice transcription remains off."
);

check(
  "health exposes v7.1 proof fields",
  health.includes('version: "v7_1_whatsapp_conversation_memory_contract_fix"') &&
    health.includes('salesBrainVersion: "v7.1"') &&
    health.includes("clientFacingPlaceholderSuppressionAvailable: true") &&
    health.includes("mergedLeadContextContractAvailable: true") &&
    health.includes("clientFacingKnownSummaryBuilderAvailable: true") &&
    health.includes("fileStatusQuestionIntentAvailable: true") &&
    health.includes("floorplanStatusReplyAvailable: true") &&
    health.includes("knownContextPersistenceAcrossReplies: true") &&
    health.includes("shortPingUsesKnownContextAvailable: true") &&
    health.includes("internalPlaceholderNeverClientFacing: true"),
  "Vercel health should prove v7.1 after deploy."
);

const failed = checks.filter((item) => !item.passed);

console.log("v7.1 WhatsApp context memory contract fix test");
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} - ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}

if (failed.length) {
  console.error(`\nFAILED ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nPASS ${checks.length}/${checks.length}`);
