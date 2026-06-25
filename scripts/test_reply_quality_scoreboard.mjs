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
  PHOTO_FIRST_REPLY,
  PRESENCE_FIRST_TOUCH_REPLY,
  runWhatsAppQaReplay,
  scoreWhatsAppReplyQuality
} = require(path.join(ROOT, "lib/whatsapp-reply-quality-scoreboard.ts"));

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
  check(`${result.id}: no banned phrases`, result.score.bannedPhrasesDetected.length === 0, result.score.bannedPhrasesDetected.join(", "));
  check(`${result.id}: no price or package amount`, !/\bS\$|\bSGD|\$|from \$|around \$|package price|price range|quote range/i.test(result.proposedReply), result.proposedReply);
  check(`${result.id}: no unsafe booking/approval promise`, !/appointment confirmed|booked for you|guaranteed approval|approval sure pass|no approval needed|confirm can/i.test(result.proposedReply), result.proposedReply);
}

const hi = results.find((item) => item.id === "first_hi");
const hello = results.find((item) => item.id === "first_hello");
const areYouThere = results.find((item) => item.id === "are_you_there");
const chineseGreeting = results.find((item) => item.id === "chinese_greeting");
const photoOnly = results.find((item) => item.id === "photo_only");
check("Hi scores PASS >= 90 with dream-home first-touch reply", hi?.score.status === "PASS" && hi.score.overallScore >= 90 && hi.proposedReply === DEFAULT_FIRST_TOUCH_REPLY, hi?.proposedReply);
check("Hello scores PASS >= 90 with dream-home first-touch reply", hello?.score.status === "PASS" && hello.score.overallScore >= 90 && hello.proposedReply === DEFAULT_FIRST_TOUCH_REPLY, hello?.proposedReply);
check("Are you there scores PASS >= 90 with presence dream-home reply", areYouThere?.score.status === "PASS" && areYouThere.score.overallScore >= 90 && areYouThere.proposedReply === PRESENCE_FIRST_TOUCH_REPLY, areYouThere?.proposedReply);
check("Chinese greeting scores PASS >= 90 with Chinese reply", chineseGreeting?.score.status === "PASS" && chineseGreeting.score.overallScore >= 90 && chineseGreeting.proposedReply === CHINESE_FIRST_TOUCH_REPLY, chineseGreeting?.proposedReply);
check("Image-only scores PASS >= 90 with photo-first reply", photoOnly?.score.status === "PASS" && photoOnly.score.overallScore >= 90 && photoOnly.proposedReply === PHOTO_FIRST_REPLY, photoOnly?.proposedReply);

const howMuch = results.find((item) => item.id === "price_blank");
check("How much stays no-price and scope-first", /cost depends on the property type, size, and actual scope/i.test(howMuch?.proposedReply ?? ""), howMuch?.proposedReply);

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
