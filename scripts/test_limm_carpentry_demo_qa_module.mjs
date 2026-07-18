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
  carpentryDemoQaItems,
  carpentryDemoQaStats,
  isCarpentryDemoKnowledgeTrigger,
  limmCarpentryDemoQaModule,
  matchCarpentryDemoQaItem
} = require(path.join(ROOT, "lib/knowledge/limm-carpentry-demo-qa.ts"));
const { matchQuestionBankIntent } = require(path.join(ROOT, "lib/whatsapp-question-bank.ts"));
const { buildWhatsAppReplyDecision } = require(path.join(ROOT, "lib/whatsapp-reply-decision.ts"));
const { validateWhatsAppAutoReply } = require(path.join(ROOT, "lib/whatsapp-safety.ts"));

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
    id: "qa-carpentry-demo",
    clientName: "QA Client",
    phone: "6599999999",
    source: "WhatsApp",
    division: "LIMM Works",
    propertyType: "",
    serviceType: "",
    scopeSummary: "",
    leadScore: 35,
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
    leadId: "qa-carpentry-demo",
    direction: "inbound",
    channel: "whatsapp",
    body,
    safeToSend: true,
    providerMessageId: `wamid.${Math.random().toString(16).slice(2)}`,
    providerTimestamp: new Date().toISOString(),
    whatsappStatus: "received",
    metadata: { messageType: type, ...metadata },
    createdAt: new Date().toISOString()
  };
}

function outbound(body, metadata = {}) {
  return {
    id: `qa-out-${Math.random().toString(16).slice(2)}`,
    leadId: "qa-carpentry-demo",
    direction: "outbound",
    channel: "whatsapp",
    body,
    safeToSend: true,
    providerMessageId: `wamid.out.${Math.random().toString(16).slice(2)}`,
    providerTimestamp: new Date().toISOString(),
    whatsappStatus: "sent",
    metadata,
    createdAt: new Date().toISOString()
  };
}

function decide(clientMessage, options = {}) {
  const current = inbound(clientMessage, options.messageType ?? "text");
  const previousMessages = [...(options.previousMessages ?? []), current];
  return buildWhatsAppReplyDecision({
    inboundMessageText: clientMessage,
    inboundMessageType: options.messageType ?? "text",
    lead: options.lead ?? baseLead(),
    previousMessages,
    autoReplyEnabled: true,
    openAiEnabled: false,
    calendarEventId: "",
    providerMessageId: current.providerMessageId
  });
}

function lower(text) {
  return String(text ?? "").toLowerCase();
}

function includesAll(reply, phrases) {
  const text = lower(reply);
  return phrases.every((phrase) => text.includes(lower(phrase)));
}

function excludesAll(reply, patterns) {
  return patterns.every((pattern) => !pattern.test(reply));
}

function assertSafeReply(label, reply) {
  const safety = validateWhatsAppAutoReply(reply, { calendarEventId: "" });
  check(`${label}: safety validator passes`, safety.ok, JSON.stringify(safety));
  check(`${label}: no price/range/package`, excludesAll(reply, [/\bS\$\s*\d/i, /\bSGD\s*\d/i, /\$\s*\d/i, /\bfrom\s*\$/i, /\baround\s*\$/i, /\bpackage price\b/i, /\bprice range\b/i, /\bquote range\b/i]), reply);
  check(`${label}: no unsafe appointment/approval/hacking certainty`, excludesAll(reply, [/\bappointment confirmed\b/i, /\bbooked for you\b/i, /\bapproval sure pass\b/i, /\bno approval needed\b/i, /\bsure can\b/i, /\bno problem\b/i, /\bconfirm can\b/i]), reply);
}

const repeatHandoffSentence = "I'll get the team to review the messages and follow up directly so we don't keep repeating the same questions.";

function assertNoRepeatHandoff(label, reply) {
  check(`${label}: no repeat handoff sentence`, !reply.includes(repeatHandoffSentence), reply);
}

const stats = carpentryDemoQaStats();
check("module id matches source", limmCarpentryDemoQaModule.moduleId === "limm_carpentry_demo_common_questions_sg");
check("module has 13 Q&A policies", carpentryDemoQaItems.length === 13 && stats.qaItems === 13, JSON.stringify(stats));
check("feature constraints remain off", !limmCarpentryDemoQaModule.featureConstraints.PRICE_GUIDE_AUTOMATION_ENABLED && !limmCarpentryDemoQaModule.featureConstraints.CALENDAR_AUTO_BOOKING_ENABLED && !limmCarpentryDemoQaModule.featureConstraints.VOICE_TRANSCRIPTION_ENABLED);
check("English trigger list includes required terms", ["carpentry", "cabinet", "hacking", "disposal", "MCST", "bomb shelter"].every((term) => limmCarpentryDemoQaModule.triggerKeywordsEn.includes(term)));
check("Mandarin trigger list includes required terms", ["木工", "橱柜", "拆柜", "敲墙", "垃圾清理", "防空室"].every((term) => limmCarpentryDemoQaModule.triggerKeywordsZh.includes(term)));
check("natural wall phrasing triggers module", isCarpentryDemoKnowledgeTrigger("Can hack this wall? I send photo."));
check("module matcher finds household shelter item", matchCarpentryDemoQaItem("Can hack bomb shelter wall to make bigger?")?.item.id === "CDQ06_HOUSEHOLD_SHELTER");
check("question bank retrieves carpentry/demo module", matchQuestionBankIntent("Can hack bomb shelter wall to make bigger?").entry.intent_key === "carpentry_demo_common_questions");

const priceCarpentry = decide("How much roughly for wardrobe and kitchen cabinet?");
check("price-first carpentry uses active module", priceCarpentry.intent === "carpentry_demo_qa" && priceCarpentry.blackBoxTrace.carpentryDemoQaItem === "CDQ01_PRICE_FIRST", JSON.stringify(priceCarpentry.blackBoxTrace));
check("wardrobe pricing uses custom carpentry drivers", includesAll(priceCarpentry.replyText, ["custom carpentry", "cabinet size", "internal layout", "material", "laminate", "hardware"]), priceCarpentry.replyText);
check("wardrobe pricing asks only photo and rough dimensions first", includesAll(priceCarpentry.replyText, ["photo of the area", "rough dimensions"]) && excludesAll(priceCarpentry.replyText, [/\bproperty type\b/i, /\bfloor plan\b/i, /\bpreferred start date\b/i]), priceCarpentry.replyText);
check("wardrobe pricing does not mention demo/disposal/approval", excludesAll(priceCarpentry.replyText, [/\bdemo\b/i, /\bdisposal\b/i, /\bapproval\b/i, /\bhacking\b/i]), priceCarpentry.replyText);
assertSafeReply("price-first carpentry", priceCarpentry.replyText);

const shortCarpentryPriceForbidden = [
  /\bdream home\b/i,
  /\bwhat renovation works\b/i,
  /\bdemo\b/i,
  /\bhacking\b/i,
  /\bdisposal\b/i,
  /\bapproval\b/i,
  /\bfloor plan\b/i
];

const kitchenCabinetPrice = decide("Kitchen cabinet how much?");
check("kitchen cabinet short price routes to carpentry module", kitchenCabinetPrice.intent === "carpentry_demo_qa" && kitchenCabinetPrice.blackBoxTrace.carpentryDemoQaItem === "CDQ01_PRICE_FIRST", JSON.stringify(kitchenCabinetPrice.blackBoxTrace));
check("kitchen cabinet pricing stays carpentry-specific", includesAll(kitchenCabinetPrice.replyText, ["custom carpentry", "photo of the area", "rough dimensions"]) && excludesAll(kitchenCabinetPrice.replyText, [...shortCarpentryPriceForbidden, /\bpreferred start date\b/i]), kitchenCabinetPrice.replyText);
assertSafeReply("kitchen cabinet pricing", kitchenCabinetPrice.replyText);

const wardrobeQuote = decide("Wardrobe quote?");
check("wardrobe quote routes to carpentry", wardrobeQuote.intent === "carpentry_demo_qa" && includesAll(wardrobeQuote.replyText, ["custom carpentry", "cabinet size", "photo of the area", "rough dimensions"]) && excludesAll(wardrobeQuote.replyText, shortCarpentryPriceForbidden), wardrobeQuote.replyText);
assertSafeReply("wardrobe quote", wardrobeQuote.replyText);

const tvConsolePrice = decide("TV console price?");
check("TV console price routes to carpentry", tvConsolePrice.intent === "carpentry_demo_qa" && includesAll(tvConsolePrice.replyText, ["custom carpentry", "photo of the area", "rough dimensions"]) && excludesAll(tvConsolePrice.replyText, shortCarpentryPriceForbidden), tvConsolePrice.replyText);
assertSafeReply("TV console price", tvConsolePrice.replyText);

const shoeCabinetPrice = decide("Shoe cabinet how much?");
check("shoe cabinet short price routes to carpentry", shoeCabinetPrice.intent === "carpentry_demo_qa" && includesAll(shoeCabinetPrice.replyText, ["custom carpentry", "photo of the area", "rough dimensions"]) && excludesAll(shoeCabinetPrice.replyText, shortCarpentryPriceForbidden), shoeCabinetPrice.replyText);
assertSafeReply("shoe cabinet pricing", shoeCabinetPrice.replyText);

const priorCustomCarpentryReply = [
  inbound("Kitchen cabinet how much?"),
  outbound(kitchenCabinetPrice.replyText, { replySource: "v9_clean_core", intent: "carpentry_demo_qa" })
];

for (const message of [
  "Wardrobe quote?",
  "TV console price?",
  "Shoe cabinet how much?",
  "Cabinet quote?",
  "Built-in wardrobe cost?",
  "Shelves price?",
  "Drawer quote?",
  "Kitchen cabinet quotation?"
]) {
  const livePathDecision = decide(message, { previousMessages: priorCustomCarpentryReply });
  check(
    `live path repeated short carpentry price keeps carpentry intent: ${message}`,
    livePathDecision.intent === "carpentry_demo_qa" &&
      livePathDecision.semanticDuplicateBlocked &&
      !livePathDecision.shouldReply &&
      livePathDecision.replyText === "",
    JSON.stringify({
      intent: livePathDecision.intent,
      semanticDuplicateBlocked: livePathDecision.semanticDuplicateBlocked,
      shouldReply: livePathDecision.shouldReply,
      replyText: livePathDecision.replyText
    })
  );
  check(
    `live path repeated short carpentry price records v10.2 semantic suppression: ${message}`,
    livePathDecision.intentionalNoReplyReason === "semantic_duplicate_reply" &&
      livePathDecision.blackBoxTrace.final_send_result === "semantic_duplicate_blocked",
    JSON.stringify(livePathDecision.blackBoxTrace.semanticDuplicateGuard)
  );
}

const priorDemoContext = [
  inbound("Remove kitchen cabinet how much?"),
  outbound("Sure, we can help review this. For demo or hacking works, we need to check the scope, site condition, access, protection and any approval requirements before advising.")
];
const currentCarpentryWins = decide("Wardrobe quote?", { previousMessages: priorDemoContext });
check("current short carpentry price wins over old demo context", currentCarpentryWins.intent === "carpentry_demo_qa" && includesAll(currentCarpentryWins.replyText, ["custom carpentry", "photo of the area", "rough dimensions"]) && excludesAll(currentCarpentryWins.replyText, shortCarpentryPriceForbidden), currentCarpentryWins.replyText);
assertSafeReply("current carpentry wins over old demo context", currentCarpentryWins.replyText);

const removeKitchenCabinet = decide("Remove kitchen cabinet how much?");
check("remove kitchen cabinet routes to demo dismantling", includesAll(removeKitchenCabinet.replyText, ["demo or hacking works", "site condition", "protection"]) && excludesAll(removeKitchenCabinet.replyText, [/\bcustom carpentry\b/i, /\bcabinet size\b/i, /\binternal layout\b/i]), removeKitchenCabinet.replyText);
assertSafeReply("remove kitchen cabinet", removeKitchenCabinet.replyText);

const dismantleWardrobe = decide("Dismantle wardrobe price?");
check("dismantle wardrobe price keeps demo action precedence", includesAll(dismantleWardrobe.replyText, ["demo or hacking works", "site condition", "protection"]) && excludesAll(dismantleWardrobe.replyText, [/\bcustom carpentry\b/i, /\bcabinet size\b/i, /\binternal layout\b/i]), dismantleWardrobe.replyText);
assertSafeReply("dismantle wardrobe price", dismantleWardrobe.replyText);

const wallHacking = decide("Can hack this wall? I send photo.");
check("wall hacking does not confirm from photo", includesAll(wallHacking.replyText, ["cannot confirm", "photo alone", "property type", "floor plan", "wall location", "approval"]), wallHacking.replyText);
check("wall hacking does not over-ask", excludesAll(wallHacking.replyText, [/\brough measurements\b/i, /\bpreferred start date\b/i, /\bdesign reference/i]), wallHacking.replyText);
check("wall hacking avoids unsafe certainty", excludesAll(wallHacking.replyText, [/\bsure can\b/i, /\bno problem\b/i, /\bconfirm can\b/i]), wallHacking.replyText);
assertNoRepeatHandoff("normal wall hacking", wallHacking.replyText);
assertSafeReply("wall hacking", wallHacking.replyText);

const shelter = decide("Can hack bomb shelter wall to make bigger?");
check("household shelter strict response", includesAll(shelter.replyText, ["household shelter", "restricted", "should not", "safer alternatives"]), shelter.replyText);
check("household shelter does not suggest cutting/removal", excludesAll(shelter.replyText, [/\bcan hack\b/i, /\bcut shelter wall\b/i, /\bremove shelter/i, /\bweaken shelter/i]), shelter.replyText);
assertSafeReply("household shelter", shelter.replyText);

const disposal = decide("Your hacking price include disposal?");
check("disposal answers directly", includesAll(disposal.replyText, ["yes", "clearly state", "quotation", "whether disposal is included"]), disposal.replyText);
check("disposal answer itemises review", includesAll(disposal.replyText, ["bagging", "haulage", "debris disposal", "protection", "basic cleaning", "photo of the area"]), disposal.replyText);
assertNoRepeatHandoff("normal disposal", disposal.replyText);
assertSafeReply("disposal", disposal.replyText);

const cabinet = decide("Can modify existing cabinet to fit bigger fridge?");
check("cabinet modification answer is useful", includesAll(cabinet.replyText, ["can help review", "resizing openings", "modifying for appliances", "existing cabinet condition", "support", "laminate", "fridge size"]), cabinet.replyText);
check("modify cabinet routes to carpentry", excludesAll(cabinet.replyText, [/\bdemo or hacking works\b/i, /\bdisposal\b/i, /\bhaulage\b/i]), cabinet.replyText);
check("cabinet modification uses fridge-specific ask", !/item size/i.test(cabinet.replyText), cabinet.replyText);
assertNoRepeatHandoff("normal cabinet modification", cabinet.replyText);
assertSafeReply("cabinet modification", cabinet.replyText);

const photosContext = decide("So can you quote me?", {
  previousMessages: [inbound("cabinet photos attached", "image", { mimeType: "image/jpeg" })]
});
check("already-sent photos acknowledged", /received the photos/i.test(photosContext.replyText), photosContext.replyText);
check("already-sent photos not requested again", !/send.{0,30}photos|photos\/video of the area/i.test(photosContext.replyText), photosContext.replyText);
assertSafeReply("already sent photos", photosContext.replyText);

const condoWeekend = decide("Can hack on Saturday? Condo management okay?");
check("condo weekend hacking explains MCST and hours", includesAll(condoWeekend.replyText, ["MCST", "management rules", "approved working hours"]), condoWeekend.replyText);
check("condo weekend hacking does not promise Saturday", !/sure saturday|saturday confirmed|can do saturday/i.test(condoWeekend.replyText), condoWeekend.replyText);
assertSafeReply("condo weekend", condoWeekend.replyText);

const mandarin = decide("拆柜多少钱？可以明天做吗？");
check("Mandarin dismantle cabinet stays demo/dismantling", mandarin.intent === "carpentry_demo_qa" && /现场情况/.test(mandarin.replyText) && /工程范围/.test(mandarin.replyText), mandarin.replyText);
check("Mandarin price/demo reply stays useful", /可以/.test(mandarin.replyText) && /房屋类型/.test(mandarin.replyText) && /现场照片或视频/.test(mandarin.replyText) && /大概尺寸/.test(mandarin.replyText) && /明天能不能安排/.test(mandarin.replyText), mandarin.replyText);
check("Mandarin price/demo reply avoids unnatural mixed English", excludesAll(mandarin.replyText, [/\bproperty type\b/i, /\brough measurements\b/i, /\bavailability\b/i]), mandarin.replyText);
check("Mandarin price/demo reply has no amount", excludesAll(mandarin.replyText, [/\$\s*\d/i, /\bS\$\s*\d/i, /\bSGD\s*\d/i, /\bfrom\s*\$/i]), mandarin.replyText);
assertNoRepeatHandoff("normal Mandarin demo price", mandarin.replyText);
assertSafeReply("Mandarin price-first", mandarin.replyText);

const laminate = decide("Can match my existing laminate exactly?");
check("laminate matching manages expectations", includesAll(laminate.replyText, ["try to match", "exact matching depends", "available", "fading"]), laminate.replyText);
check("laminate matching gives no perfect guarantee", !/guarantee exact|perfect match/i.test(laminate.replyText), laminate.replyText);
assertSafeReply("laminate matching", laminate.replyText);

const multi = decide("Can hack kitchen wall, disposal included, and start next week?");
check("multi-intent demo answers all parts", includesAll(multi.replyText, ["wall", "approval", "disposal", "start", "photos", "floor plan", "property type"]), multi.replyText);
check("multi-intent demo uses one reply", multi.replyText.trim().length > 0 && multi.shouldReply, multi.replyText);
assertSafeReply("multi-intent demo", multi.replyText);

const lockedLead = baseLead({ bossApprovalNeeded: true });
const lockedWallHacking = decide("Can hack this wall? I send photo.", { lead: lockedLead });
check("normal Q&A with stale handoff lock keeps wall answer", includesAll(lockedWallHacking.replyText, ["cannot confirm", "photo alone", "wall location"]), lockedWallHacking.replyText);
assertNoRepeatHandoff("normal Q&A with stale handoff lock", lockedWallHacking.replyText);

const frustratedWallHacking = decide("Why you keep repeating? Can hack this wall?", { lead: lockedLead });
check("frustrated thread keeps safe handoff behavior", /repeat|team|check/i.test(frustratedWallHacking.replyText), frustratedWallHacking.replyText);

const qaCentre = read("app/qa-centre/page.tsx");
check("QA Centre exposes carpentry/demo pack", qaCentre.includes("Open Carpentry / Demo Pack") && qaCentre.includes("showCarpentryDemoPack"));
check("QA Centre remains simulation-only", qaCentre.includes("Simulation-only") && qaCentre.includes("No WhatsApp message will be sent."));
check("QA Centre does not expose live send", !/Send WhatsApp|fetch\("\/api\/inbox\/send"|sendWhatsAppTextMessage|adapter\.sendReply/.test(qaCentre));

const health = read("app/api/whatsapp/health/route.ts");
check("price guide stays on hold", health.includes("priceGuideOnHold: true"));
check("calendar auto-booking remains false", health.includes("calendarAutoBookingEnabled: false"));
check("voice transcription remains false", health.includes("voiceTranscriptionEnabled: false"));

const sendBackend = read("app/api/inbox/send/route.ts");
check("send backend not wired to QA module", !sendBackend.includes("limm-carpentry-demo-qa") && !sendBackend.includes("carpentryDemoQaItems"));

const failed = checks.filter((item) => !item.passed);

console.log("LIMM carpentry/demo Q&A module test");
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} - ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}

if (failed.length) {
  console.error(`\nFAILED ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nPASS ${checks.length}/${checks.length}`);
console.log(`Q&A policies: ${stats.qaItems}`);
console.log(`English triggers: ${stats.englishTriggers}`);
console.log(`Mandarin triggers: ${stats.mandarinTriggers}`);
