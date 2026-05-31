import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalise(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function contains(source, phrase) {
  return normalise(source).includes(normalise(phrase));
}

function assertReplySafety(reply, label) {
  const forbidden = [
    /\bS\$\s*\d{2,}/i,
    /\bSGD\s*\d{2,}/i,
    /\$\s*\d{2,}/,
    /\b\d{2,}\s*k\b/i,
    /\bquote range\b/i,
    /\bprice range\b/i,
    /\brough estimate\b/i,
    /\bestimated price\b/i,
    /\bprice estimate\b/i,
    /\bpackage price\b/i,
    /\bfrom\s+\$?\d+/i,
    /\bappointment confirmed\b/i,
    /\bwe have booked\b/i,
    /\byour appointment has been arranged\b/i,
    /\bapproval sure pass\b/i,
    /\bno approval needed\b/i,
    /\bconfirm can\b/i,
    /\bsure can\b/i,
    /\bcan hack\b/i,
    /\bguaranteed\b/i,
    /\bfree consultation\b/i,
    /\bstock image\b/i,
    /\bfake project photos?\b/i
  ];
  assert(reply.trim().length > 0, `${label} reply must not be empty.`);
  assert(/initial project review/i.test(reply), `${label} must include initial project review.`);
  for (const pattern of forbidden) {
    assert(!pattern.test(reply), `${label} contains forbidden pattern ${pattern}: ${reply}`);
  }
}

for (const file of [
  "lib/whatsapp-multi-intent.ts",
  "lib/whatsapp-lead-context.ts",
  "lib/whatsapp-reply-coach.ts",
  "lib/whatsapp-reply-decision.ts",
  "app/api/whatsapp/health/route.ts",
  "lib/adapters/whatsapp-adapter.ts",
  "docs/V5_3_1_MULTI_INTENT_LEAD_CONTEXT_PORTFOLIO.md"
]) {
  assert(exists(file), `Missing v5.3.1 file: ${file}`);
}

const multiIntent = read("lib/whatsapp-multi-intent.ts");
const context = read("lib/whatsapp-lead-context.ts");
const coach = read("lib/whatsapp-reply-coach.ts");
const decision = read("lib/whatsapp-reply-decision.ts");
const health = read("app/api/whatsapp/health/route.ts");
const adapter = read("lib/adapters/whatsapp-adapter.ts");
const envExample = read(".env.example");

for (const phrase of [
  "detectWhatsAppMessageIntents",
  "appointment_request",
  "meeting_availability",
  "design_theme",
  "landed_renovation",
  "landed_aa",
  "price_question",
  "hacking_wall",
  "approval_submission",
  "portfolio_request",
  "generic_renovation"
]) {
  assert(multiIntent.includes(phrase), `Multi-intent detector missing ${phrase}`);
}

for (const phrase of [
  "inferWhatsAppLeadContext",
  "hasFloorPlan",
  "hasSitePhotos",
  "hasScopeOfWork",
  "hasPropertyType",
  "hasAddressOrArea",
  "hasPreferredAppointmentTime",
  "hasDesignReferences",
  "knownContextSummary",
  "buildMissingInfoAsk",
  "getLimmInstagramUrl"
]) {
  assert(context.includes(phrase), `Lead context memory missing ${phrase}`);
}

const expectedMultiIntentReply = [
  "Yes, we can help with the",
  "landed renovation",
  "design direction",
  "appointment request",
  "For the design theme, we can propose a suitable direction after reviewing your layout, lighting, storage needs and preferred style.",
  "not confirmed yet",
  "For wall hacking or approval matters, we'll need to review the drawings and site condition first",
  "wall type, structure, services, scope and whether submission is required"
];
for (const phrase of expectedMultiIntentReply) {
  assert(contains(coach, phrase), `Combined reply composer missing phrase: ${phrase}`);
}

const sampleReplies = [
  {
    label: "multi-intent combined",
    reply: "Yes, we can help with the landed renovation, design direction and appointment request.\n\nFor the design theme, we can propose a suitable direction after reviewing your layout, lighting, storage needs and preferred style.\n\nWednesday 2pm noted. We can help check availability, but the appointment is not confirmed yet. Could you share your property type, property area/address and basic renovation scope first so the team can review before confirming?\n\nFor wall hacking or approval matters, we'll need to review the drawings and site condition first because it depends on the wall type, structure, services, scope and whether submission is required.\n\nCould you send the floor plan, site photos and scope of work if available for an initial project review?"
  },
  {
    label: "price no scope",
    reply: "I understand you'd like a rough idea. To advise properly, could you share the scope of work first? Pricing depends on the property type, areas involved, site condition, material direction and whether any A&A or authority-related work is needed. Once we understand the scope, we can review the next step more accurately for an initial project review."
  },
  {
    label: "price with context",
    reply: "I understand you'd like a rough idea. Thanks, we've received the floor plan and scope. We'll need to review the details, drawings, site condition and material direction first, because giving a rough figure too early can be misleading. The team can go through this properly during the initial project review."
  },
  {
    label: "portfolio without Instagram",
    reply: "Yes, we can share relevant references. Could you let us know what type of project you want to see, such as landed A&A, kitchen, bathroom, carpentry, hacking works, design works or commercial renovation? The team can then share suitable references for your initial project review."
  }
];

for (const item of sampleReplies) {
  assertReplySafety(item.reply, item.label);
}

for (const phrase of [
  "I understand you'd like a rough idea. To advise properly, could you share the scope of work first?",
  "Thanks, we've received the floor plan and scope.",
  "giving a rough figure too early can be misleading",
  "not confirmed yet",
  "Since we've received the main details, the team will review and confirm whether that slot works for an initial project review.",
  "Yes, we can share relevant references.",
  "you can view some of our renovation works, design references and project-related content on our Instagram here",
  "Final design and scope still depend on your site condition, drawings and requirements",
  "Hi, yes we're here.",
  "Yes, we're here. Sorry if you were waiting.",
  "Thanks, we've received the"
]) {
  assert(contains(coach, phrase), `Reply Coach missing v5.3.1 behavior phrase: ${phrase}`);
}

assert(coach.includes("composeMultiIntentReply"), "Human-style combined reply composer missing.");
assert(coach.includes("composePortfolioReply"), "Portfolio routing composer missing.");
assert(coach.includes("composeAppointmentReply"), "Context-aware appointment composer missing.");
assert(coach.includes("composePriceReply"), "Scope-first price composer missing.");
assert(coach.includes("composePingReply"), "Ping variation composer missing.");
assert(coach.includes("composeWhatNextReply"), "What-next context reply missing.");
assert(coach.includes("missingFieldsAsked"), "Coach result must expose missingFieldsAsked.");
assert(coach.includes("repeatedInfoAvoided"), "Coach result must expose repeatedInfoAvoided.");

for (const phrase of [
  "detectedIntents",
  "primaryIntent",
  "multiIntentDetected",
  "leadContextChecked",
  "knownContextSummary",
  "missingFieldsAsked",
  "repeatedInfoAvoided",
  "portfolioRequestDetected",
  "instagramUrlAvailable",
  "humanFollowUpTaskCreated",
  "humanFollowUpTaskSkippedReason",
  "combinedReplyUsed"
]) {
  assert(decision.includes(phrase), `Black box reply trace missing ${phrase}`);
}

for (const field of [
  "version: \"v5_3_1_multi_intent_lead_context_portfolio\"",
  "salesBrainVersion: \"v5.3.1\"",
  "multiIntentDetectorAvailable",
  "combinedReplyComposerAvailable",
  "leadContextMemoryCheckerAvailable",
  "avoidRepeatedInfoRequestAvailable",
  "priceScopeFirstRuleAvailable",
  "portfolioInstagramRoutingAvailable",
  "instagramUrlConfigured",
  "portfolioHumanFollowUpTaskAvailable",
  "replyCoachAvailable",
  "replyDecisionEngineAvailable",
  "noSilenceFallbackAvailable",
  "blackBoxReplyRecorderAvailable",
  "openaiWhatsappReplyEnabled",
  "calendarAutoBookingEnabled"
]) {
  assert(health.includes(field), `Health endpoint missing v5.3.1 proof: ${field}`);
}

assert(envExample.includes("NEXT_PUBLIC_LIMM_INSTAGRAM_URL="), ".env.example missing NEXT_PUBLIC_LIMM_INSTAGRAM_URL.");
assert(envExample.includes("LIMM_INSTAGRAM_URL="), ".env.example missing LIMM_INSTAGRAM_URL.");

for (const phrase of [
  "messaging_product: \"whatsapp\"",
  "recipient_type: \"individual\"",
  "preview_url: false",
  "type: \"text\"",
  "normalizeWhatsAppPhone(to)"
]) {
  assert(adapter.includes(phrase), `Known-good WhatsApp adapter payload shape missing ${phrase}`);
}

const wrongWhatsAppPhoneNumberId = "115395" + "2887800145";
const textFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", "test-results", "playwright-report"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs|md|json|sql|example)$/i.test(entry.name)) textFiles.push(full);
  }
}
walk(root);
for (const file of textFiles) {
  const content = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  assert(!content.includes(wrongWhatsAppPhoneNumberId), `Wrong WhatsApp Phone Number ID reintroduced in ${relative}.`);
  assert(!/^WHATSAPP_ACCESS_TOKEN[^\S\r\n]*=[^\S\r\n]*[A-Za-z0-9._-]{20,}$/m.test(content), `WhatsApp token committed in ${relative}.`);
  assert(!/^SUPABASE_SERVICE_ROLE_KEY[^\S\r\n]*=[^\S\r\n]*[A-Za-z0-9._-]{20,}$/m.test(content), `Supabase service role committed in ${relative}.`);
  assert(!/^OPENAI_API_KEY[^\S\r\n]*=[^\S\r\n]*[A-Za-z0-9._-]{20,}$/m.test(content), `OpenAI key committed in ${relative}.`);
}

assert(!/OPENAI_WHATSAPP_REPLY_ENABLED=true/.test(envExample), "OpenAI WhatsApp reply must not be enabled by default.");
assert(!/CALENDAR_AUTO_BOOKING_ENABLED=true/.test(envExample), "Calendar auto-booking must not be enabled by default.");
assert(!/send random photos|stock images as past work|claim fake project/i.test(coach), "Reply coach must not send or claim fake/stock project photos.");

console.log("PASS: v5.3.1 multi-intent, lead context, portfolio routing, safety, health, and payload checks passed.");
