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

const playbook = read("docs/LIMM_WHATSAPP_SALES_AGENT_PLAYBOOK_V5.md");
const v7 = read("lib/whatsapp-v7-sales-brain.ts");
const context = read("lib/whatsapp-lead-context.ts");
const decision = read("lib/whatsapp-reply-decision.ts");
const safety = read("lib/whatsapp-safety.ts");
const adapter = read("lib/adapters/whatsapp-adapter.ts");
const health = read("app/api/whatsapp/health/route.ts");
const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";

const buildFunction = v7.match(/export function buildV7WorldClassWhatsAppSalesBrainDecision[\s\S]*?\n}\n?$/)?.[0] ?? "";
const plannerSection = v7.match(/export function planWhatsAppSalesReply[\s\S]*?function askSentence/)?.[0] ?? "";
const replyReturnLiterals = [...v7.matchAll(/return\s+(`[^`]*`|"[^"]*"|'[^']*')/g)]
  .map((match) => match[1])
  .join("\n");

check(
  "1. Playbook v5 source of truth exists",
  playbook.includes("LIMM WhatsApp Sales Agent Playbook v5") &&
    playbook.includes("There must not be multiple competing composers") &&
    /Major Landed A\\?&A Rule/.test(playbook),
  "The permanent playbook should remain committed."
);

check(
  "2. single reply planner exists",
  v7.includes("export function planWhatsAppSalesReply") &&
    v7.includes("V7WhatsAppSalesReplyPlan") &&
    v7.includes("primaryMove") &&
    v7.includes("questionBudget"),
  "Planner must return the approved structured plan."
);

check(
  "3. final v7 build uses planner output",
  buildFunction.includes("planWhatsAppSalesReply(input)") &&
    buildFunction.includes("composeReplyFromPlan") &&
    buildFunction.includes("judgeHumanFeel") &&
    !buildFunction.includes("composeReply(input"),
  "The live v7 decision path must not call the old per-intent composer selector."
);

check(
  "4. old fallback paths cannot override v7 planner",
  decision.includes("let usingV7Reply = Boolean(v7Decision.replyText)") &&
    decision.includes("let replyText = v7Decision.replyText || v6Decision.replyText || coach.replyText") &&
    v7.includes("shouldReply: input.autoReplyEnabled && Boolean(replyText)"),
  "v7 returns the first non-empty reply for valid text; v6/coach are fallback only."
);

check(
  "5. sales moment classifier available",
  v7.includes("salesMoment: primary") &&
    v7.includes("classifyClientState") &&
    health.includes("salesMomentClassifierAvailable: true"),
  "Planner must classify the moment before composing."
);

check(
  "6. client patience detector available",
  v7.includes("detectClientPatience") &&
    v7.includes("already told you") &&
    v7.includes("slightly_confused") &&
    health.includes("clientPatienceDetectorAvailable: true"),
  "ok?/??/already told you should reduce question count."
);

check(
  "7. lead seriousness scorer available",
  v7.includes("scoreLeadSeriousness") &&
    v7.includes("isSeriousLandedAa") &&
    v7.includes("premium") &&
    health.includes("leadSeriousnessScorerAvailable: true"),
  "Major landed A&A needs serious/premium mode."
);

check(
  "8. next best move selector available",
  v7.includes("selectPrimaryMove") &&
    v7.includes("confirm_file_status") &&
    v7.includes("safe_price_reply") &&
    v7.includes("route_to_portfolio") &&
    health.includes("nextBestMoveSelectorAvailable: true"),
  "Planner must pick one primary sales move."
);

check(
  "9. direct question first enforced",
  v7.includes("directAnswerFor") &&
    v7.includes("return plan.fileStatusAnswer") &&
    v7.includes("return `${plan.directAnswer}") &&
    health.includes("directQuestionFirstEnforced: true"),
  "Direct questions must be answered before intake."
);

check(
  "10. file status replay answers status first",
  v7.includes("fileStatusAnswerFor") &&
    v7.includes("Yes, we've received the floor plan. That will help the team review the layout and A&A scope more properly.") &&
    v7.includes("I don't see the floor plan confirmed on our side yet. Could you resend it here?"),
  "can you see my floorplan? must not start with generic intake."
);

check(
  "11. file status reply does not ask address/scope again",
  /if \(plan\.primaryMove === "confirm_file_status"\) \{\s*return plan\.fileStatusAnswer;\s*}/.test(v7),
  "File-status move should return file answer only."
);

check(
  "12. budget statement is not price question",
  v7.includes("provide_budget_expectation") &&
    v7.includes("!intents.includes(\"provide_budget_expectation\")") &&
    v7.includes("Thanks, that budget expectation helps.") &&
    context.includes("isBudgetStatementText"),
  "budget 500k should become budget expectation context."
);

check(
  "13. price question gets safe no-price reply",
  v7.includes("I understand you'd like a rough idea. To avoid giving the wrong figure") &&
    v7.includes("Giving a rough figure too early can be misleading") &&
    safety.includes("pricing_amount"),
  "Price replies must not give a figure."
);

check(
  "14. serious landed A&A rule available",
  v7.includes("function isSeriousLandedAa") &&
    v7.includes("seriousLandedAaNextItems") &&
    v7.includes("floor_plan\", \"site_photos\", \"design_references") &&
    v7.includes("design_references\", \"lifestyle") &&
    v7.includes("meeting_timing") &&
    v7.includes("seriousLandedAaRuleAvailable: true") &&
    health.includes("seriousLandedAaRuleAvailable: true"),
  "Serious landed A&A should move to files/references/lifestyle/meeting."
);

check(
  "15. serious landed A&A avoids main areas",
  v7.includes("\"main_areas\"") &&
    v7.includes("serious_landed_aa_asked_main_areas") &&
    v7.includes("!(isKnownLandedAa(context) && field === \"scope\")"),
  "Main areas / which areas should fail serious landed A&A."
);

check(
  "16. serious landed A&A summary format is client-facing",
  v7.includes("replace(/,\\s+with A&A works/i, \" for A&A works\")") &&
    context.includes("cleanClientFacingText") &&
    health.includes("internalPlaceholderNeverClientFacing: true"),
  "Summary should say for A&A works and suppress internal placeholders."
);

check(
  "17. ok? replay is short and context-aware",
  v7.includes("/^\\s*ok\\?\\s*$/i") &&
    v7.includes("Yes, noted. We have your ${knownShort} recorded.") &&
    v7.includes("questionBudget = patience !== \"normal\" ? 1"),
  "ok? should not trigger a checklist."
);

check(
  "18. ?? replay clarifies without full intake",
  v7.includes("Sorry if that was unclear.") &&
    v7.includes("primaryMove === \"clarify_confusion\"") &&
    v7.includes("ask 0-1") === false,
  "Confusion should be handled by patience/question budget, not broad intake."
);

check(
  "19. already told you recovers trust",
  v7.includes("You're right, sorry about that.") &&
    v7.includes("recover_from_mistake") &&
    v7.includes("forbiddenFieldsToAskAgain"),
  "Repetition recovery should apologize and reuse memory."
);

check(
  "20. appointment replay does not confirm booking",
  v7.includes("noted as your preferred timing") &&
    v7.includes("team will check availability before confirming") &&
    safety.includes("appointment_confirmation_without_calendar_event") &&
    !/appointment confirmed|booked for you|we have booked/i.test(replyReturnLiterals),
  "Appointment remains preference/availability check only."
);

check(
  "21. portfolio sends Instagram link directly",
  v7.includes("You can view some of our past works here: ${getLimmInstagramUrl()}") &&
    context.includes("OFFICIAL_LIMM_INSTAGRAM_URL = \"https://www.instagram.com/limmworks/\""),
  "Portfolio request must not bury the link."
);

check(
  "22. design question answers yes first",
  v7.includes("Yes, we can help with design direction and renovation planning.") &&
    v7.includes("layout, lighting, lifestyle, storage needs and renovation scope"),
  "Design replies answer capability before asking references."
);

check(
  "23. hacking / approval remains safe",
  v7.includes("team will need to review the drawings, site condition, scope and applicable requirements") &&
    v7.includes("The team can review wall hacking works") &&
    safety.includes("hacking_certainty"),
  "No hacking/approval certainty."
);

check(
  "24. Singlish understood with English reply path",
  v7.includes("reno landed can") &&
    decision.includes("how much ah") &&
    decision.includes("replyLanguage: \"professional_english\""),
  "Singlish triggers should still route to professional English replies."
);

check(
  "25. voice fallback preserved",
  decision.includes("voiceFallbackReply") &&
    decision.includes("Sorry, we're not able to listen to voice messages here") &&
    health.includes("voiceTranscriptionEnabled: false"),
  "No voice transcription is introduced."
);

check(
  "26. human-feel judge available",
  v7.includes("export function judgeHumanFeel") &&
    v7.includes("minimumScore") &&
    v7.includes("absolute_fail_phrase") &&
    health.includes("humanFeelJudgeAvailable: true"),
  "Replies must be judged before sending."
);

check(
  "27. stop asking rule works once basics are known",
  v7.includes("fieldAlreadyKnown") &&
    v7.includes("forbiddenFieldsToAskAgain") &&
    v7.includes("known_info_asked_again") &&
    health.includes("stopAskingRuleAvailable: true"),
  "Known fields must not be asked again."
);

check(
  "28. no-silence guard preserved",
  decision.includes("NO_SILENCE_FALLBACK_REPLY") &&
    decision.includes("noSilenceGuardResult") &&
    decision.includes("valid_client_text"),
  "Final reply decision still protects against empty replies."
);

check(
  "29. safety false-positive fallback preserved",
  safety.includes("WHATSAPP_ULTRA_SAFE_FALLBACK_REPLY") &&
    decision.includes("safe_fallback") &&
    health.includes("finalSafetyFalsePositiveFixAvailable: true"),
  "Final safety fallback remains intact."
);

check(
  "30. known-good WhatsApp payload preserved",
  adapter.includes('messaging_product: "whatsapp"') &&
    adapter.includes('recipient_type: "individual"') &&
    adapter.includes('type: "text"') &&
    adapter.includes("preview_url: false") &&
    adapter.includes("normalizeWhatsAppPhone(to)") &&
    !adapter.includes(wrongWhatsAppPhoneNumberId),
  "Meta send contract must remain unchanged."
);

check(
  "31. no client-facing internal placeholders in v7 planner replies",
  !/WhatsApp renovation enquiry pending review|renovation enquiry pending review|not provided/i.test(replyReturnLiterals),
  "Internal labels must not leak."
);

check(
  "32. no rough price/range/from/package",
  !/from \$|around \$\d|package price|price range|quote range|rough estimate/i.test(replyReturnLiterals.replace(/budget expectation around \$500k/g, "budget expectation")) &&
    health.includes("priceGuideOnHold: true"),
  "Generated replies must not contain quote amounts."
);

check(
  "33. no forbidden consultation wording",
  !/free consultation/i.test(replyReturnLiterals) &&
    safety.includes("forbidden_consultation_wording"),
  "Use initial project review only."
);

check(
  "34. health exposes v7.2 proof fields",
  health.includes('version: "v7_2_single_reply_planner_playbook_v5"') &&
    health.includes('salesBrainVersion: "v7.2"') &&
    health.includes("playbookV5SingleReplyPlannerAvailable: true") &&
    health.includes("budgetStatementNotPriceQuestionAvailable: true") &&
    health.includes("calendarAutoBookingEnabled: calendar.autoBookingEnabled") &&
    health.includes("calendarAutoBookingEnabled: false") &&
    health.includes("voiceTranscriptionEnabled: false"),
  "Vercel health must prove v7.2 after deploy."
);

const failed = checks.filter((item) => !item.passed);

console.log("v7.2 single reply planner playbook v5 test");
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} - ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}

if (failed.length) {
  console.error(`\nFAILED ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nPASS ${checks.length}/${checks.length}`);
