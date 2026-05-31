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

function includesPhrase(text, phrase) {
  return normalise(text).includes(normalise(phrase));
}

function matchesEntryPhrase(entry, message, phrase) {
  const normalisedMessage = normalise(message);
  const normalisedPhrase = normalise(phrase);
  if (entry.intent === "follow_up_ping" && ["hello", "hi", "update"].includes(normalisedPhrase)) {
    return normalisedMessage === normalisedPhrase;
  }
  return includesPhrase(message, phrase);
}

function blockForIntent(source, intentKey) {
  const pattern = new RegExp(`intent_key:\\s*"${intentKey}"[\\s\\S]*?(?=\\n\\s*\\{\\n\\s*intent_key:|\\n\\];)`, "m");
  const match = source.match(pattern);
  assert(match, `Missing question bank intent: ${intentKey}`);
  return match[0];
}

function extractArray(block, fieldName) {
  const match = block.match(new RegExp(`${fieldName}:\\s*\\[([\\s\\S]*?)\\]`, "m"));
  assert(match, `Missing ${fieldName}`);
  return [...match[1].matchAll(/"([^"]*)"/g)].map((item) => item[1]);
}

function extractString(block, fieldName) {
  const match = block.match(new RegExp(`${fieldName}:\\s*"([^"]*)"`, "m"));
  assert(match, `Missing ${fieldName}`);
  return match[1];
}

const bankPath = "lib/whatsapp-question-bank.ts";
const brainPath = "lib/whatsapp-sales-brain.ts";

for (const file of [
  bankPath,
  brainPath,
  "components/LeadCard.tsx",
  "app/leads/[id]/page.tsx",
  "WHATSAPP_QUESTION_BANK_PLAYBOOK.md",
  "V5_2_WHATSAPP_QUESTION_BANK_REPORT.md"
]) {
  assert(exists(file), `Missing v5.2 file: ${file}`);
}

const bank = read(bankPath);
const brain = read(brainPath);
const leadCard = read("components/LeadCard.tsx");
const leadDetail = read("app/leads/[id]/page.tsx");

const requiredIntents = [
  "general_enquiry",
  "landed_renovation",
  "aa_works",
  "design_theme",
  "price_question",
  "site_visit_request",
  "appointment_request",
  "follow_up_ping",
  "floorplan_or_photos_sent",
  "condo_renovation",
  "commercial_renovation",
  "hacking_demo",
  "carpentry",
  "timeline_question",
  "submission_approval",
  "structural_wall",
  "waterproofing_drainage_roof",
  "bathroom_kitchen",
  "small_handyman",
  "complaint_or_risk",
  "spam_unrelated"
];

const entries = requiredIntents.map((intent) => {
  const block = blockForIntent(bank, intent);
  for (const field of [
    "category",
    "example_questions",
    "classification_keywords",
    "safe_answer_strategy",
    "required_missing_info",
    "risk_flags",
    "escalation_rule",
    "forbidden_claims",
    "reply_variations",
    "follow_up_question",
    "audit_tag"
  ]) {
    assert(block.includes(`${field}:`), `${intent} missing field ${field}`);
  }
  return {
    intent,
    block,
    category: extractString(block, "category"),
    examples: extractArray(block, "example_questions"),
    keywords: extractArray(block, "classification_keywords"),
    replies: extractArray(block, "reply_variations"),
    escalationRule: extractString(block, "escalation_rule")
  };
});

const categoryCount = (bank.match(/intent_key:\s*"/g) ?? []).length;
const exampleCount = [...bank.matchAll(/example_questions:\s*\[([\s\S]*?)\]/g)]
  .reduce((sum, match) => sum + [...match[1].matchAll(/"([^"]*)"/g)].length, 0);

assert(categoryCount >= 20, `Expected at least 20 question bank categories, found ${categoryCount}`);
assert(exampleCount >= 60, `Expected broad question coverage, found ${exampleCount} examples`);

const priority = [
  "complaint_or_risk",
  "price_question",
  "submission_approval",
  "structural_wall",
  "aa_works",
  "site_visit_request",
  "appointment_request",
  "floorplan_or_photos_sent",
  "follow_up_ping",
  "waterproofing_drainage_roof",
  "design_theme",
  "commercial_renovation",
  "landed_renovation",
  "condo_renovation",
  "bathroom_kitchen",
  "hacking_demo",
  "carpentry",
  "timeline_question",
  "small_handyman",
  "spam_unrelated",
  "general_enquiry",
  "unsupported"
];

function classify(message) {
  const scored = entries.map((entry) => {
    const matchedKeywords = entry.keywords.filter((keyword) => matchesEntryPhrase(entry, message, keyword));
    const matchedExamples = entry.examples.filter((example) => matchesEntryPhrase(entry, message, example));
    return {
      ...entry,
      score: matchedKeywords.length + matchedExamples.length * 2,
      matchedKeywords,
      matchedExamples
    };
  });
  const specificMatches = scored.filter((item) => item.score > 0 && !["general_enquiry", "unsupported"].includes(item.intent));
  const candidates = specificMatches.length ? specificMatches : scored;
  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return priority.indexOf(left.intent) - priority.indexOf(right.intent);
  });
  return candidates[0];
}

for (const [message, expectedIntent] of [
  ["Hi, I want to renovate my landed house.", "landed_renovation"],
  ["can you come up with design theme?", "design_theme"],
  ["how much roughly?", "price_question"],
  ["can make appt for wed 2pm?", "appointment_request"],
  ["are you there?", "follow_up_ping"],
  ["I have floor plan", "floorplan_or_photos_sent"],
  ["This is A&A for landed", "aa_works"],
  ["Can hack wall?", "hacking_demo"],
  ["Need approval?", "submission_approval"],
  ["Do you do carpentry?", "carpentry"],
  ["Can do commercial shop?", "commercial_renovation"],
  ["How long will it take?", "timeline_question"],
  ["I want refund", "complaint_or_risk"],
  ["roof leaking", "waterproofing_drainage_roof"]
]) {
  const result = classify(message);
  assert(result.intent === expectedIntent, `Expected "${message}" to classify as ${expectedIntent}, got ${result.intent}`);
  assert(result.score > 0, `Expected "${message}" to match question bank keywords/examples.`);
}

const forbiddenReplyPatterns = [
  /\bfree consultation\b/i,
  /\bS\$\s*\d{2,}/i,
  /\bSGD\s*\d{2,}/i,
  /\$\s*\d{2,}/,
  /\b\d{2,}\s*k\b/i,
  /\bquote range\b/i,
  /\brough estimate\b/i,
  /\bestimated price\b/i,
  /\bpackage price\b/i,
  /\bappointment confirmed\b/i,
  /\bwe have booked\b/i,
  /\byour appointment has been arranged\b/i,
  /\bsee you tomorrow\b/i,
  /\bguaranteed\b/i,
  /\bwe can definitely\b/i,
  /\bconfirmed no permit\b/i,
  /\bcan hack for sure\b/i
];

for (const entry of entries) {
  assert(entry.replies.length >= 3, `${entry.intent} needs at least 3 reply variations.`);
  for (const reply of entry.replies) {
    assert(/\b(thanks|no worries|i understand|sure|got it|yes|hi)\b/i.test(reply), `${entry.intent} reply lacks friendly acknowledgement: ${reply}`);
    assert(/initial project review/i.test(reply), `${entry.intent} reply must use initial project review wording.`);
    for (const pattern of forbiddenReplyPatterns) {
      assert(!pattern.test(reply), `${entry.intent} reply contains forbidden wording/pattern ${pattern}: ${reply}`);
    }
    if (!["floorplan_or_photos_sent", "complaint_or_risk"].includes(entry.intent)) {
      assert(
        /\b(avoid|because|helps?|understand|review|scope|layout|condition|details?)\b/i.test(reply),
        `${entry.intent} reply should explain why details are needed: ${reply}`
      );
    }
  }
}

for (const intent of ["price_question", "site_visit_request", "appointment_request", "submission_approval", "structural_wall", "complaint_or_risk"]) {
  const entry = entries.find((item) => item.intent === intent);
  assert(entry, `Missing ${intent}`);
  assert(entry.escalationRule !== "auto_safe", `${intent} must not be fully auto-safe.`);
}

assert(blockForIntent(bank, "price_question").includes("pricing_request"), "Price questions must set pricing_request risk flag.");
assert(blockForIntent(bank, "appointment_request").includes("appointment_request"), "Appointment questions must set appointment_request risk flag.");
assert(blockForIntent(bank, "complaint_or_risk").includes('escalation_rule: "boss_only"'), "Complaint/risk must be boss-only.");
assert(blockForIntent(bank, "structural_wall").includes("structural_review"), "Structural/wall questions must flag structural review.");
assert(blockForIntent(bank, "submission_approval").includes("approval_expectation"), "Submission questions must flag approval expectation.");

for (const phrase of [
  "whatsappQuestionBank",
  "matchQuestionBankIntent",
  "selectQuestionBankReply",
  "questionBankStats"
]) {
  assert(bank.includes(phrase), `Question bank missing export/function: ${phrase}`);
}

for (const phrase of [
  "matchQuestionBankIntent(context.latestInboundMessage)",
  "selectQuestionBankReply",
  "question_bank_intent",
  "matched_examples",
  "matched_keywords",
  "reply_strategy",
  "safety_category",
  "escalation_required",
  "repetition_checked",
  "repeated_detected"
]) {
  assert(brain.includes(phrase), `Sales brain missing question bank integration phrase: ${phrase}`);
}

assert(/previousOutbound[\s\S]{0,900}selectQuestionBankReply/.test(brain), "Question bank replies must use previous outbound replies for repetition guard.");
assert(/repeatedPricePressure/.test(brain), "Repeated price pressure must escalate instead of repeating a safe answer forever.");

for (const phrase of [
  "Matched question intent",
  "Latest question bank category",
  "Reply strategy",
  "Escalation required",
  "Escalation reason"
]) {
  assert(leadDetail.includes(phrase), `Lead detail missing question bank metadata display: ${phrase}`);
}

for (const phrase of [
  "matchQuestionBankIntent",
  "Question category:",
  "Boss Review Required",
  "Reply strategy:"
]) {
  assert(leadCard.includes(phrase), `Lead card missing question bank badge/display: ${phrase}`);
}

const docs = [
  read("WHATSAPP_QUESTION_BANK_PLAYBOOK.md"),
  read("V5_2_WHATSAPP_QUESTION_BANK_REPORT.md"),
  read("WHATSAPP_AUTO_REPLY_SAFETY_RULES.md"),
  read("LIVE_INTEGRATION_PRODUCTION_PROOF_PLAYBOOK.md"),
  read("CURRENT_STATUS.md"),
  read("NEXT_STEPS_FOR_CHATGPT.md"),
  read("CHATGPT_HANDOFF_REPORT.md")
].join("\n");

for (const phrase of [
  "v5.2 WhatsApp Question Bank",
  "question bank intent",
  "price question",
  "appointment request",
  "design theme",
  "non-repetition",
  "boss review required"
]) {
  assert(docs.toLowerCase().includes(phrase.toLowerCase()), `v5.2 docs missing phrase: ${phrase}`);
}

console.log(`PASS: v5.2 WhatsApp question bank covers ${categoryCount} categories and ${exampleCount} example questions.`);
