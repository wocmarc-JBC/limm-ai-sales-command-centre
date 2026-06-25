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
    if (fs.existsSync(`${target}.tsx`)) return `${target}.tsx`;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX
    },
    fileName: filename
  }).outputText;
  module._compile(output, filename);
};

const {
  BANNED_REPLY_PHRASES,
  CHINESE_FIRST_TOUCH_REPLY,
  DEFAULT_FIRST_TOUCH_REPLY,
  DESIGN_FIRST_TOUCH_REPLY,
  PHOTO_FIRST_REPLY,
  PRESENCE_FIRST_TOUCH_REPLY,
  runWhatsAppQaReplay,
  scoreWhatsAppReplyQuality
} = require(path.join(ROOT, "lib/whatsapp-reply-quality-scoreboard.ts"));

const { buildWhatsAppReplyDecision } = require(path.join(ROOT, "lib/whatsapp-reply-decision.ts"));

const checks = [];

function check(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function baseLead(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: "qa-lead",
    clientName: "QA Client",
    phone: "6599999999",
    source: "WhatsApp",
    division: "LIMM Works",
    propertyType: "",
    serviceType: "",
    scopeSummary: "",
    leadScore: 30,
    leadCategory: "Warm",
    status: "New Enquiry",
    missingInfo: [],
    aiRecommendedNextAction: "QA simulation only.",
    bossApprovalNeeded: false,
    appointmentReadiness: 0,
    quotationReadiness: 0,
    lastClientMessage: "",
    lastReplyAt: null,
    createdAt: now,
    updatedAt: now,
    preferredContactTime: "",
    riskFlags: [],
    ...overrides
  };
}

function inbound(body, type = "text", metadata = {}) {
  return {
    id: `qa-${Math.random().toString(16).slice(2)}`,
    leadId: "qa-lead",
    direction: "inbound",
    channel: "whatsapp",
    body,
    safeToSend: true,
    providerMessageId: `qa-${Math.random().toString(16).slice(2)}`,
    providerTimestamp: new Date().toISOString(),
    whatsappStatus: "received",
    metadata: { messageType: type, ...metadata },
    createdAt: new Date().toISOString()
  };
}

const scenarios = [
  ["first_hi", "Hi", "text", "greeting_only"],
  ["first_hello", "Hello", "text", "greeting_only"],
  ["are_you_there", "Are you there?", "text", "greeting_only"],
  ["can_do_renovation", "Can do renovation?", "text", "general"],
  ["design_for_me", "can you do design for me", "text", "design_question"],
  ["do_you_do_design", "do you do design", "text", "design_question"],
  ["design_theme", "can help with design theme", "text", "design_question"],
  ["propose_concept", "can propose concept", "text", "design_question"],
  ["interior_design", "can do interior design", "text", "design_question"],
  ["design_direction", "can you come up with design direction", "text", "design_question"],
  ["design_ideas", "need design ideas", "text", "design_question"],
  ["layout_ideas", "need layout ideas", "text", "design_question"],
  ["chinese_greeting", "你好", "text", "chinese_message"],
  ["kitchen_scope", "Hi, I want renovate kitchen", "text", "kitchen_enquiry"],
  ["condo_kitchen_toilets", "Condo kitchen and 2 toilets", "text", "kitchen_enquiry"],
  ["landed_aa", "Landed A&A", "text", "landed_aa"],
  ["office_ubi", "Office renovation at Ubi", "text", "property_type"],
  ["price_blank", "How much?", "text", "price_question"],
  ["price_kitchen", "Kitchen how much?", "text", "price_question"],
  ["price_toilet", "Toilet how much?", "text", "price_question"],
  ["price_whole_house", "Whole house how much?", "text", "price_question"],
  ["package_question", "Any package?", "text", "price_question"],
  ["photo_only", "", "image", "media_received"],
  ["floor_plan_only", "floor plan attached", "document", "media_received"],
  ["already_sent_floor_plan", "I sent the floor plan already", "text", "frustrated_client"],
  ["can_come_down", "Can come down?", "text", "appointment_request"],
  ["meet_tomorrow", "Can meet tomorrow?", "text", "appointment_request"],
  ["site_visit", "Can site visit?", "text", "appointment_request"],
  ["already_sent_plan", "I already sent you the plan", "text", "frustrated_client"],
  ["why_ask_again", "Why ask again?", "text", "frustrated_client"],
  ["hack_wall", "Can hack wall?", "text", "safety_risk"],
  ["confirm_approve", "Confirm can approve?", "text", "safety_risk"],
  ["start_tomorrow", "Can start tomorrow?", "text", "appointment_request"]
];

const results = scenarios.map(([id, message, type, scenario]) => {
  const previous = [inbound(message, type)];
  const lead = baseLead();
  const result = runWhatsAppQaReplay({
    lead,
    previousMessages: previous,
    clientMessage: message,
    messageType: type,
    scenario
  });
  return { id, ...result };
});

const takeoverResult = runWhatsAppQaReplay({
  lead: baseLead({ botPaused: true, botPausedAt: new Date().toISOString(), botPauseReason: "Marcus manual takeover" }),
  previousMessages: [inbound("Marcus replied already")],
  clientMessage: "Hi",
  messageType: "text",
  scenario: "human_takeover"
});
results.push({ id: "human_takeover", ...takeoverResult });

const floorPlanKnownLead = baseLead({
  intakeProfile: {
    floorPlanStatus: "received",
    propertyType: "condo",
    scopeOfWork: "kitchen"
  },
  propertyType: "condo",
  scopeSummary: "kitchen"
});
const floorPlanKnownResult = runWhatsAppQaReplay({
  lead: floorPlanKnownLead,
  previousMessages: [inbound("floor plan attached", "document", { filename: "floorplan.pdf" })],
  clientMessage: "I already sent you the plan",
  messageType: "text",
  scenario: "frustrated_client"
});
results.push({ id: "known_floor_plan_not_reasked", ...floorPlanKnownResult });

for (const result of results) {
  check(`${result.id}: simulation only`, result.simulationOnly && !result.whatsappSendCalled, "QA replay must never send WhatsApp.");
  check(`${result.id}: reply is non-empty unless human takeover disabled send`, result.proposedReply.trim().length > 0, result.proposedReply);
  check(`${result.id}: scores PASS >= 90`, result.score.status === "PASS" && result.score.overallScore >= 90, JSON.stringify({ reply: result.proposedReply, score: result.score.overallScore, status: result.score.status, failedRules: result.score.failedRules }));
  check(`${result.id}: no banned phrases`, result.score.bannedPhrasesDetected.length === 0, result.score.bannedPhrasesDetected.join(", "));
  check(`${result.id}: no price or package amount`, !/\bS\$|\bSGD|\$|from \$|around \$|package price|price range|quote range/i.test(result.proposedReply), result.proposedReply);
  check(`${result.id}: no unsafe booking/approval promise`, !/appointment confirmed|booked for you|guaranteed approval|approval sure pass|no approval needed|confirm can/i.test(result.proposedReply), result.proposedReply);
}

const hi = results.find((item) => item.id === "first_hi");
const hello = results.find((item) => item.id === "first_hello");
const areYouThere = results.find((item) => item.id === "are_you_there");
const chineseGreeting = results.find((item) => item.id === "chinese_greeting");
const photoOnly = results.find((item) => item.id === "photo_only");
const designResults = results.filter((item) => item.scenario === "design_question");
const officeUbi = results.find((item) => item.id === "office_ubi");
const alreadySentFloorPlan = results.find((item) => item.id === "already_sent_floor_plan");
const whyAskAgain = results.find((item) => item.id === "why_ask_again");
const canComeDown = results.find((item) => item.id === "can_come_down");
const confirmApprove = results.find((item) => item.id === "confirm_approve");
const startTomorrow = results.find((item) => item.id === "start_tomorrow");
check("Hi scores PASS >= 90 with dream-home first-touch reply", hi?.score.status === "PASS" && hi.score.overallScore >= 90 && hi.proposedReply === DEFAULT_FIRST_TOUCH_REPLY, hi?.proposedReply);
check("Hello scores PASS >= 90 with dream-home first-touch reply", hello?.score.status === "PASS" && hello.score.overallScore >= 90 && hello.proposedReply === DEFAULT_FIRST_TOUCH_REPLY, hello?.proposedReply);
check("Are you there scores PASS >= 90 with presence dream-home reply", areYouThere?.score.status === "PASS" && areYouThere.score.overallScore >= 90 && areYouThere.proposedReply === PRESENCE_FIRST_TOUCH_REPLY, areYouThere?.proposedReply);
check("Chinese greeting scores PASS >= 90 with Chinese reply", chineseGreeting?.score.status === "PASS" && chineseGreeting.score.overallScore >= 90 && chineseGreeting.proposedReply === CHINESE_FIRST_TOUCH_REPLY, chineseGreeting?.proposedReply);
check("Image-only scores PASS >= 90 with photo-first reply", photoOnly?.score.status === "PASS" && photoOnly.score.overallScore >= 90 && photoOnly.proposedReply === PHOTO_FIRST_REPLY, photoOnly?.proposedReply);
for (const design of designResults) {
  check(`${design.id} scores PASS >= 90 with approved design reply`, design.score.status === "PASS" && design.score.overallScore >= 90 && design.proposedReply === DESIGN_FIRST_TOUCH_REPLY, design.proposedReply);
  check(`${design.id} answers design question before collecting info`, /yes, we can help review the design direction/i.test(design.proposedReply), design.proposedReply);
  check(`${design.id} includes LIMM dream-home line`, /dream home/i.test(design.proposedReply), design.proposedReply);
  check(`${design.id} asks property type and renovation areas`, /type of property/i.test(design.proposedReply) && /which areas/i.test(design.proposedReply), design.proposedReply);
  check(`${design.id} has no apology or recovery handoff wording`, !/sorry about that|team.{0,40}review.{0,40}messages|keep repeating/i.test(design.proposedReply), design.proposedReply);
}

const howMuch = results.find((item) => item.id === "price_blank");
check("How much stays no-price and scope-first", /cost depends on the property type, size, and actual scope/i.test(howMuch?.proposedReply ?? ""), howMuch?.proposedReply);

check(
  "Office renovation does not require dream-home phrasing",
  officeUbi?.score.status === "PASS" &&
    !/dream home/i.test(officeUbi.proposedReply) &&
    /office renovation works/i.test(officeUbi.proposedReply) &&
    /renovate or fit out/i.test(officeUbi.proposedReply),
  officeUbi?.proposedReply
);
check(
  "Already-sent floor plan recovery acknowledges received plan",
  alreadySentFloorPlan?.score.status === "PASS" &&
    /sorry about that/i.test(alreadySentFloorPlan.proposedReply) &&
    /received the floor plan/i.test(alreadySentFloorPlan.proposedReply) &&
    !/send.{0,25}floor plan|share.{0,25}floor plan|provide.{0,25}floor plan/i.test(alreadySentFloorPlan.proposedReply),
  alreadySentFloorPlan?.proposedReply
);
check(
  "Why ask again recovery does not require dream-home",
  whyAskAgain?.score.status === "PASS" &&
    /sorry about that/i.test(whyAskAgain.proposedReply) &&
    /don't repeat the same questions/i.test(whyAskAgain.proposedReply) &&
    !/dream home/i.test(whyAskAgain.proposedReply),
  whyAskAgain?.proposedReply
);
check(
  "Can come down remains appointment logistics",
  canComeDown?.score.status === "PASS" &&
    /project review/i.test(canComeDown.proposedReply) &&
    /property type, rough location, and main scope/i.test(canComeDown.proposedReply) &&
    !/dream home/i.test(canComeDown.proposedReply),
  canComeDown?.proposedReply
);
check(
  "Approval risk reply does not require dream-home",
  confirmApprove?.score.status === "PASS" &&
    /approval|requirements|property type|actual works/i.test(confirmApprove.proposedReply) &&
    !/approval sure pass|confirm can|no approval needed/i.test(confirmApprove.proposedReply) &&
    !/dream home/i.test(confirmApprove.proposedReply),
  confirmApprove?.proposedReply
);
check(
  "Can start tomorrow gets timeline-safe reply",
  startTomorrow?.score.status === "PASS" &&
    /check the timeline/i.test(startTomorrow.proposedReply) &&
    /scope, site condition, and team availability/i.test(startTomorrow.proposedReply) &&
    !/dream home/i.test(startTomorrow.proposedReply),
  startTomorrow?.proposedReply
);

const kitchenPrice = results.find((item) => item.id === "price_kitchen");
check("Kitchen how much names cost drivers without pricing", /carpentry.*hacking.*tiling.*plumbing.*electrical.*countertop/i.test(kitchenPrice?.proposedReply ?? ""), kitchenPrice?.proposedReply);

check("Known floor plan is not requested again", !/send.{0,25}floor plan|share.{0,25}floor plan|provide.{0,25}floor plan/i.test(floorPlanKnownResult.proposedReply), floorPlanKnownResult.proposedReply);
check("Human takeover prevents auto-reply send", takeoverResult.decision.shouldReply === false, JSON.stringify(takeoverResult.decision));

const bannedScore = scoreWhatsAppReplyQuality({
  clientMessage: "Hi",
  reply: "Hii dear, kindly furnish details for a free consultation.",
  scenario: "greeting_only"
});
check("Banned phrases are detected", bannedScore.status === "FAIL" && bannedScore.bannedPhrasesDetected.length >= 3, JSON.stringify(bannedScore));

const oldBadDesignReply = "Sorry about that. I'll get the team to review the messages and follow up directly so we don't keep repeating the same questions.";
const oldBadDesignScore = scoreWhatsAppReplyQuality({
  clientMessage: "can you do design for me",
  reply: oldBadDesignReply,
  scenario: "design_question"
});
check(
  "Old design recovery handoff reply fails QA",
  oldBadDesignScore.status === "FAIL" &&
    ["did_not_answer_design_question", "inappropriate_apology", "inappropriate_recovery_reply", "missing_limm_dream_home_when_design_context"].every((rule) => oldBadDesignScore.failedRules.includes(rule)),
  JSON.stringify(oldBadDesignScore)
);

const weakBrandDesignScore = scoreWhatsAppReplyQuality({
  clientMessage: "can you do design for me",
  reply: "Yes, we can help.",
  scenario: "design_question"
});
check(
  "Brand score below 85 cannot pass",
  weakBrandDesignScore.status !== "PASS" && weakBrandDesignScore.failedRules.includes("brand_score_below_threshold"),
  JSON.stringify(weakBrandDesignScore)
);

const unsafeApprovalScore = scoreWhatsAppReplyQuality({
  clientMessage: "Confirm can approve?",
  reply: "Confirm can approve.",
  scenario: "safety_risk"
});
check(
  "Safety question with approval certainty fails",
  unsafeApprovalScore.status === "FAIL" && unsafeApprovalScore.failedRules.includes("unsafe_confirmation_or_guarantee"),
  JSON.stringify(unsafeApprovalScore)
);

const unsafePriceScore = scoreWhatsAppReplyQuality({
  clientMessage: "How much?",
  reply: "Package price from $5000.",
  scenario: "price_question"
});
check(
  "Price question with from-dollar package fails",
  unsafePriceScore.status === "FAIL" && unsafePriceScore.failedRules.includes("price_or_range_detected"),
  JSON.stringify(unsafePriceScore)
);

const greetingWithoutDreamScore = scoreWhatsAppReplyQuality({
  clientMessage: "Hi",
  reply: "Hi, thanks for contacting LIMM Works. May I know what renovation works you're planning?",
  scenario: "greeting_only"
});
check(
  "Greeting without dream-home phrase fails",
  greetingWithoutDreamScore.status === "FAIL" && greetingWithoutDreamScore.failedRules.includes("first_touch_missing_dream_home"),
  JSON.stringify(greetingWithoutDreamScore)
);

const takeoverWithAutoReplyScore = scoreWhatsAppReplyQuality({
  clientMessage: "Marcus has replied already",
  reply: "Hi, thanks for contacting LIMM Works. We'd love to help create your dream home. May I know what type of property this is and what renovation works you're planning?",
  decision: { shouldReply: true, calendarEventId: "" },
  scenario: "human_takeover"
});
check(
  "Human takeover with auto-reply fails",
  takeoverWithAutoReplyScore.status === "FAIL" && takeoverWithAutoReplyScore.failedRules.includes("human_takeover_not_respected"),
  JSON.stringify(takeoverWithAutoReplyScore)
);

const staleHandoffDesignDecision = buildWhatsAppReplyDecision({
  inboundMessageText: "can you do design for me",
  inboundMessageType: "text",
  lead: baseLead({
    intakeProfile: {
      trace: {
        v9Memory: {
          handoff_lock: true,
          client_patience: "annoyed",
          correction_history: ["client_frustration_detected"]
        }
      }
    }
  }),
  previousMessages: [inbound("you asked already")],
  autoReplyEnabled: true,
  openAiEnabled: false,
  calendarEventId: "",
  providerMessageId: "qa-design-handoff-lock"
});
check(
  "Live v9 decision answers design even with stale handoff lock",
  staleHandoffDesignDecision.intent === "design_question" &&
    /yes, we can help review the design direction/i.test(staleHandoffDesignDecision.replyText) &&
    !/sorry about that|team.{0,40}review.{0,40}messages|keep repeating/i.test(staleHandoffDesignDecision.replyText),
  JSON.stringify({
    intent: staleHandoffDesignDecision.intent,
    stage: staleHandoffDesignDecision.stage,
    replySource: staleHandoffDesignDecision.replySource,
    replyText: staleHandoffDesignDecision.replyText
  })
);

const qaPage = read("app/qa-centre/page.tsx");
const copyButton = read("components/CopySuggestedReplyButton.tsx");
check("QA Centre route exists and states simulation only", qaPage.includes("Simulation only") && qaPage.includes("No WhatsApp message will be sent."), "Missing simulation copy.");
check("QA Centre exposes required actions", ["Run Replay", "Run Scenario Pack", "Open Lead in Inbox", "View Source Conversation"].every((phrase) => qaPage.includes(phrase)) && copyButton.includes("Copy Suggested Reply"), "Missing QA action.");
check("QA Centre does not expose live send button", !/Send WhatsApp|sendReply|adapter\.sendReply|\/api\/inbox\/send/.test(qaPage), "QA page must not send.");

const settings = read("app/settings/page.tsx");
check("Settings links to QA Centre", settings.includes('["QA Centre", "/qa-centre"'), "Settings System Settings must link to /qa-centre.");

const reportRows = results.map((result) => ({
  id: result.id,
  clientMessage: result.clientMessage,
  scenario: result.scenario,
  proposedReply: result.proposedReply,
  score: result.score.overallScore,
  status: result.score.status,
  failedRules: result.score.failedRules,
  suggestedCorrection: result.score.suggestedCorrectedReply,
  simulationOnly: result.simulationOnly,
  whatsappSendCalled: result.whatsappSendCalled
}));

fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, "artifacts/reply-quality-report.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), rows: reportRows }, null, 2)
);
fs.writeFileSync(
  path.join(ROOT, "artifacts/reply-quality-report.md"),
  [
    "# LIMM WhatsApp Reply Quality Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Test case | Client message | Scenario | Score | Status | Failed rules |",
    "| --- | --- | --- | ---: | --- | --- |",
    ...reportRows.map((row) =>
      `| ${row.id} | ${String(row.clientMessage || `(${row.scenario})`).replace(/\|/g, "/")} | ${row.scenario} | ${row.score} | ${row.status} | ${row.failedRules.join(", ") || "None"} |`
    ),
    "",
    "Simulation only. No WhatsApp messages were sent."
  ].join("\n")
);

const failed = checks.filter((item) => !item.passed);

console.log("Reply quality scoreboard test");
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} - ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}
console.log("Report: artifacts/reply-quality-report.md");
console.log("Report JSON: artifacts/reply-quality-report.json");

if (failed.length) {
  console.error(`\nFAILED ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nPASS ${checks.length}/${checks.length}`);
