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

const { buildV9WhatsAppSalesBrainDecision } = require(path.join(ROOT, "lib/whatsapp-v9-sales-brain.ts"));
const { validateWhatsAppAutoReply } = require(path.join(ROOT, "lib/whatsapp-safety.ts"));

const checks = [];

function check(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}

function assertNoBanned(reply, label) {
  const banned = [
    /dear/i,
    /kindly furnish/i,
    /revert accordingly/i,
    /free consultation/i,
    /cheap package/i,
    /best price/i,
    /from \$/i,
    /around \$/i,
    /continue sending project details/i,
    /team will review the next step properly/i,
    /no problem confirm can/i,
    /guaranteed approval/i,
    /wow exciting/i,
    /hii dear/i
  ];
  for (const pattern of banned) {
    check(`${label} avoids banned phrase ${pattern}`, !pattern.test(reply), reply);
  }
}

function baseLead(overrides = {}) {
  return {
    id: "lead-test",
    clientName: "Test Client",
    phone: "6599999999",
    source: "whatsapp",
    division: "LIMM Works",
    propertyType: "",
    serviceType: "",
    scopeSummary: "",
    leadScore: 0,
    leadCategory: "Warm",
    status: "New",
    missingInfo: [],
    aiRecommendedNextAction: "",
    bossApprovalNeeded: false,
    appointmentReadiness: 0,
    quotationReadiness: 0,
    lastClientMessage: "",
    lastReplyAt: null,
    createdAt: "2026-06-25T00:00:00.000Z",
    preferredContactTime: "",
    riskFlags: [],
    ...overrides
  };
}

function inboundMessage(body, type = "text", metadata = {}) {
  return {
    id: `msg-${Math.random().toString(16).slice(2)}`,
    leadId: "lead-test",
    direction: "inbound",
    channel: "whatsapp",
    body,
    safeToSend: true,
    providerMessageId: `wamid.${Math.random().toString(16).slice(2)}`,
    providerTimestamp: "2026-06-25T00:00:00.000Z",
    whatsappStatus: "received",
    metadata: { messageType: type, ...metadata },
    createdAt: "2026-06-25T00:00:00.000Z"
  };
}

function decide({ text, type = "text", lead = baseLead(), previousMessages }) {
  const messages = previousMessages ?? [inboundMessage(text, type)];
  return buildV9WhatsAppSalesBrainDecision({
    inboundMessageText: text,
    inboundMessageType: type,
    lead,
    previousMessages: messages,
    autoReplyEnabled: true,
    calendarEventId: "",
    providerMessageId: "wamid.test"
  });
}

const expectedReplies = [
  ["Hi", "Hi, thanks for contacting LIMM Works. We'd love to help create your dream home. May I know what type of property this is and what renovation works you're planning?"],
  ["Hello", "Hi, thanks for contacting LIMM Works. We'd love to help create your dream home. May I know what type of property this is and what renovation works you're planning?"],
  ["Are you there?", "Hi, yes we're here. Thanks for contacting LIMM Works. May I know what renovation works you're planning?"],
  ["Can do renovation?", "Hi, yes we can help review renovation works. We'd love to help create your dream home. May I know what type of property this is and what works you're planning?"],
  ["Hi, I want renovate kitchen", "Hi, thanks for contacting LIMM Works. We'd love to help create your dream home, starting with the kitchen works. May I know if this is for a HDB, condo, landed property, or commercial unit?"],
  ["This is for my condo", "Hi, thanks for contacting LIMM Works. We'd love to help create your dream home. May I know which areas of the condo you're planning to renovate?"],
  ["Condo kitchen and 2 toilets", "Thanks for sharing. We'd love to help create your dream home. You may send us the floor plan, site photos, and any reference images here first, and we'll review the scope from there."],
  ["Landed A&A", "Thanks for contacting LIMM Works. We'd love to help create your dream home and review the landed/A&A works properly. May I know which areas you're planning to change?"],
  ["你好", "你好，感谢联系 LIMM Works。我们很期待帮您打造理想的家。请问这是 HDB、公寓、landed 还是商业单位？主要想装修哪些部分？"]
];

for (const [input, expected] of expectedReplies) {
  const reply = decide({ text: input }).replyText;
  check(`first-touch reply for "${input}"`, reply === expected, `actual: ${reply}`);
  assertNoBanned(reply, input);
}

const photoReply = decide({ text: "", type: "image", previousMessages: [inboundMessage("", "image", { mimeType: "image/jpeg" })] }).replyText;
check("photo-only first-touch acknowledges photos", photoReply === "Hi, thanks for sending the photos. May I know what works you're planning for this area?", photoReply);

const floorPlanReply = decide({
  text: "floor plan attached",
  type: "document",
  previousMessages: [inboundMessage("floor plan attached", "document", { filename: "floorplan.pdf" })]
}).replyText;
check("floor-plan-only first-touch acknowledges floor plan", floorPlanReply === "Hi, thanks for sending the floor plan. May I know the main areas you're planning to renovate?", floorPlanReply);

const priceCases = [
  ["How much?", "We can help review this, but the cost depends on the property type, size, and actual scope. May I know what renovation works you're planning?"],
  ["Kitchen how much?", "We can help review the kitchen works. The cost depends on whether it includes carpentry only, or also hacking, tiling, plumbing, electrical and countertop works. May I know what you're planning for the kitchen?"],
  ["Toilet how much?", "We can help review the toilet works. The cost depends on whether it includes hacking, waterproofing, tiling, plumbing, sanitary fittings and electrical works. May I know what works you're planning to include?"],
  ["Whole house how much?", "We can help review a whole-house renovation. The cost depends on the property type, size, existing condition and scope. May I know if this is for a HDB, condo, landed property or commercial unit?"],
  ["Any package?", "We usually review based on the actual scope rather than fixed packages, so the proposal can match the property and works needed. May I know what type of property this is and which areas you're planning to renovate?"]
];

for (const [input, expected] of priceCases) {
  const reply = decide({ text: input }).replyText;
  check(`price reply for "${input}"`, reply === expected, `actual: ${reply}`);
  check(`price reply for "${input}" has no generated amount`, !/\$|S\$|SGD|\b\d{2,}\s*k\b|\b\d{5,}\b|from \$|around \$/i.test(reply), reply);
  assertNoBanned(reply, input);
}

const factsLead = baseLead({
  propertyType: "condo",
  scopeSummary: "kitchen and toilets",
  intakeProfile: {
    propertyType: "condo",
    scopeOfWork: "kitchen and toilets",
    floorPlanStatus: "received"
  }
});
const factsReply = decide({ text: "Condo kitchen and 2 toilets", lead: factsLead }).replyText;
check("known floor plan is not asked again", !/\b(?:send|share|provide).{0,25}floor\s*plan\b/i.test(factsReply), factsReply);
check("known facts still produce a reply", factsReply.trim().length > 0, factsReply);

const greetingReply = decide({ text: "Hi" }).replyText;
check("greeting-only does not ask for floor plan/photos", !/floor plan|site photos|photos/i.test(greetingReply), greetingReply);

const safetyBadPhrase = validateWhatsAppAutoReply("Yes, we're here. You can continue sending project details here, and the team will review the next step properly.");
check("safety validator blocks legacy ping wording", !safetyBadPhrase.ok && safetyBadPhrase.errorCodes.includes("legacy_or_unsafe_reply_phrase"), JSON.stringify(safetyBadPhrase));

const autoReplySource = fs.readFileSync(path.join(ROOT, "lib/whatsapp-auto-reply.ts"), "utf8");
check(
  "human takeover/bot pause prevents auto-reply before brain generation",
  autoReplySource.includes("if (lead.botPaused)") &&
    autoReplySource.includes("reason: \"bot_paused_for_lead\"") &&
    autoReplySource.includes("WhatsApp auto-reply skipped because human takeover or bot pause is active for this lead."),
  "bot pause guard missing"
);

const failed = checks.filter((item) => !item.passed);

console.log("WhatsApp sales agent reply behaviour test");
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} - ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}

if (failed.length) {
  console.error(`\nFAILED ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nPASS ${checks.length}/${checks.length}`);
