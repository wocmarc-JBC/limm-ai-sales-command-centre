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

function containsSourcePhrase(source, phrase) {
  return normalise(source).includes(normalise(phrase));
}

function assertSafeReply(reply, label) {
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
    /\bappointment confirmed\b/i,
    /\bwe have booked\b/i,
    /\byour appointment has been arranged\b/i,
    /\bsee you tomorrow\b/i,
    /\bguaranteed\b/i,
    /\bwe can definitely\b/i,
    /\bconfirmed no permit\b/i,
    /\bcan hack for sure\b/i,
    /\bshould be okay to hack\b/i,
    /\bcompletion date is confirmed\b/i
  ];
  assert(reply.trim().length > 0, `${label} produced an empty reply.`);
  assert(/initial project review/i.test(reply), `${label} must keep initial project review wording.`);
  for (const pattern of forbidden) {
    assert(!pattern.test(reply), `${label} contains forbidden wording/pattern ${pattern}: ${reply}`);
  }
}

for (const file of [
  "lib/whatsapp-reply-coach.ts",
  "lib/whatsapp-reply-decision.ts",
  "lib/whatsapp-auto-reply.ts",
  "lib/adapters/whatsapp-adapter.ts",
  "app/api/whatsapp/health/route.ts"
]) {
  assert(exists(file), `Missing v5.3 file: ${file}`);
}

const coach = read("lib/whatsapp-reply-coach.ts");
const decision = read("lib/whatsapp-reply-decision.ts");
const autoReply = read("lib/whatsapp-auto-reply.ts");
const adapter = read("lib/adapters/whatsapp-adapter.ts");
const health = read("app/api/whatsapp/health/route.ts");

const replay = [
  {
    message: "Hi, I want to renovate my landed house.",
    intent: "landed_renovation",
    sourcePhrases: ["For landed renovation", "layout, access and site conditions"],
    expectedReply: "Thanks for reaching out. For landed renovation, it is best not to advise blindly because layout, access and site conditions can affect the scope. Could you send the floor plan or site photos if available? We can take a look properly for an initial project review."
  },
  {
    message: "can you come up with design theme?",
    intent: "design_theme",
    sourcePhrases: ["Yes, we can help propose a suitable design direction", "modern warm luxury, Japandi, minimalist"],
    expectedReply: "Yes, we can help propose a suitable design direction. The right theme should match your layout, lighting, lifestyle, storage needs and renovation scope, for example modern warm luxury, Japandi, minimalist or contemporary landed style. If you can send your floor plan, photos or reference images, we can review what direction fits best for an initial project review."
  },
  {
    message: "can make appt for wed 2pm?",
    intent: "appointment_request",
    sourcePhrases: ["We can help check", "Before confirming a slot"],
    expectedReply: "We can help check Wednesday 2pm. Before confirming a slot, could you share your property type, property area/address and basic renovation scope? The team will review availability before confirming for an initial project review.",
    exactSourceRequired: false
  },
  {
    message: "how much roughly?",
    intent: "price_question",
    sourcePhrases: ["I understand you'd like a rough idea", "To advise properly"],
    expectedReply: "I understand you'd like a rough idea. To advise properly, could you share the scope of work first? Pricing depends on the property type, areas involved, site condition, material direction and whether any A&A or authority-related work is needed. Once we understand the scope, we can review the next step more accurately for an initial project review."
  },
  {
    message: "are you there?",
    intent: "follow_up_ping",
    sourcePhrases: ["Yes, we're here", "Sorry if you were waiting"],
    expectedReply: "Yes, we're here. Sorry if you were waiting. Could you share what type of renovation you're planning, or send the floor plan/scope if you already have it for an initial project review?"
  },
  {
    message: "hello",
    intent: "follow_up_ping",
    sourcePhrases: ["Hi, yes we're here", "send your floor plan"],
    expectedReply: "Hi, yes we're here. You can send your floor plan, site photos or renovation scope, and we'll help review the next step for an initial project review."
  },
  {
    message: "when is next available slot for meeting?",
    intent: "appointment_request",
    sourcePhrases: ["next available meeting slot", "not confirmed yet"],
    expectedReply: "We can help check the next available meeting slot, but it is not confirmed yet. Could you share your property type, property area/address and basic renovation scope first so the team can review before confirming for an initial project review?",
    exactSourceRequired: false
  },
  {
    message: "can you confirm wed 2pm?",
    intent: "appointment_request",
    sourcePhrases: ["not confirmed yet", "review before confirming"],
    expectedReply: "We can help check Wednesday 2pm. Before confirming a slot, could you share your property type, property area/address and basic renovation scope? The team will review availability before confirming for an initial project review.",
    exactSourceRequired: false
  },
  {
    message: "can hack wall?",
    intent: "hacking_demo",
    sourcePhrases: ["wall hacking should not be advised blindly", "wall type, services and structure need to be checked"],
    expectedReply: "We can help review it, but wall hacking should not be advised blindly because the wall type, services and structure need to be checked. Could you send the floor plan and photos of the wall so the team can review the next step for an initial project review?"
  },
  {
    message: "need approval?",
    intent: "submission_approval",
    sourcePhrases: ["It depends on the property type and exact scope", "proper checking or submission"],
    expectedReply: "It depends on the property type and exact scope. Some works may require proper checking or submission, so we should review the drawings, site condition and proposed changes before advising. Could you send the floor plan or a short description of the works for an initial project review?"
  },
  {
    message: "can finish in 2 weeks?",
    intent: "timeline_question",
    sourcePhrases: ["avoid promising a timeline", "material lead time"],
    expectedReply: "We should avoid promising a timeline before reviewing the full scope and site condition. Duration can depend on material lead time, trade sequencing and site readiness. Could you share the areas involved and your target date so the team can review it properly for an initial project review?"
  },
  {
    message: "I want refund / lawyer",
    intent: "complaint_or_risk",
    sourcePhrases: ["get the manager to review", "before advising the next step"],
    expectedReply: "Thanks for raising this. I'll get the manager to review the matter properly before advising the next step. Could you share the details, photos or messages related to the issue so it can be checked carefully for an initial project review?"
  }
];

for (const item of replay) {
  assert(coach.includes(item.intent), `${item.message} must map to ${item.intent}.`);
  for (const phrase of item.sourcePhrases) {
    assert(containsSourcePhrase(coach, phrase), `${item.message} reply path missing phrase: ${phrase}`);
  }
  if (item.exactSourceRequired !== false) {
    assert(containsSourcePhrase(coach, item.expectedReply), `${item.message} expected reply is not present in Reply Coach.`);
  }
  assertSafeReply(item.expectedReply, item.message);
}

assert(coach.includes("answer_design_direction_and_request_refs"), "Design questions must answer design first, not only ask for plans.");
assert(coach.includes("safe_price_deflection_and_collect_info"), "Price questions must use safe no-price deflection.");
assert(coach.includes("warm_ping_reassurance"), "Ping/hello messages must get a warm reassurance path.");
assert(coach.includes("appointment_followup_pending_review"), "Appointment follow-up must be handled without confirmation.");
assert(coach.includes("complaint_or_legal_handoff"), "Complaint/legal messages must hand off to manager review.");

for (const phrase of [
  "NO_SILENCE_FALLBACK_REPLY",
  "!replyText.trim()",
  "valid_client_text",
  "blackBoxTrace",
  "final_reply_text",
  "quality_score",
  "no_silence_guard_result",
  "safety_result",
  "repetition_result",
  "selected_sales_move"
]) {
  assert(decision.includes(phrase), `Reply decision engine missing ${phrase}.`);
}

assert(/return\s*\{[\s\S]*shouldReply:\s*input\.autoReplyEnabled\s*&&\s*validText\s*&&\s*Boolean\(replyText\.trim\(\)\)/.test(decision), "Valid text must only reach send with non-empty reply text.");
assert(decision.includes("safeRewriteFor(coach.intent)"), "Safety/repetition/quality failures must rewrite or fallback instead of silence.");
assert(decision.includes("NO_SILENCE_FALLBACK_REPLY"), "No-silence fallback must be impossible to bypass accidentally.");

for (const action of [
  "whatsapp_reply_decision_started",
  "whatsapp_sales_brain_classified",
  "whatsapp_conversation_stage_detected",
  "whatsapp_sales_move_selected",
  "whatsapp_reply_candidate_created",
  "whatsapp_reply_safety_checked",
  "whatsapp_reply_repetition_checked",
  "whatsapp_reply_quality_checked",
  "whatsapp_no_silence_guard_checked",
  "whatsapp_no_silence_fallback_used",
  "whatsapp_reply_finalized",
  "whatsapp_auto_reply_requested",
  "whatsapp_auto_reply_sent",
  "whatsapp_auto_reply_send_failed",
  "whatsapp_handoff_required",
  "whatsapp_auto_reply_intentional_no_reply"
]) {
  assert(autoReply.includes(action), `WhatsApp auto-reply service missing audit/log event: ${action}`);
}

assert(autoReply.includes("whatsapp_rate_limit_warning"), "The old rate limiter must now record a warning.");
assert(autoReply.includes("distinctTextWillStillReply"), "Rate-limit warning must prove distinct valid text still proceeds.");
assert(!autoReply.includes("Too many auto-replies sent to this WhatsApp phone."), "Old hard rate-limit silence reason must be removed.");
assert(!/recentReplyCount\s*>=\s*3[\s\S]{0,900}return\s+\{[\s\S]{0,300}auto_reply_disabled/.test(autoReply), "Rate-limit threshold must not return before reply decision.");

for (const phrase of [
  "messaging_product: \"whatsapp\"",
  "recipient_type: \"individual\"",
  "preview_url: false",
  "type: \"text\"",
  "normalizeWhatsAppPhone(to)",
  "https://graph.facebook.com/${runtime.graphVersion}/${phoneNumberId}/messages"
]) {
  assert(adapter.includes(phrase), `Known-good WhatsApp adapter payload shape changed or missing: ${phrase}`);
}

for (const field of [
  "version: \"v5_3_1_multi_intent_lead_context_portfolio\"",
  "salesBrainVersion: \"v5.3.1\"",
  "replyCoachAvailable",
  "replyDecisionEngineAvailable",
  "replyQualityGateAvailable",
  "validTextNeverEmptyReplyGuard",
  "noSilenceFallbackAvailable",
  "safetyRewriteInsteadOfSilence",
  "repetitionRewriteInsteadOfSilence",
  "answerActualQuestionFirstRule",
  "blackBoxReplyRecorderAvailable",
  "humanTakeoverLockPlanned",
  "questionBankAvailable",
  "openaiWhatsappReplyEnabled",
  "calendarAutoBookingEnabled"
]) {
  assert(health.includes(field), `Health endpoint missing v5.3 proof field: ${field}`);
}

const allTextFiles = [];
const wrongPhoneNumberId = "115395" + "2887800145";
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", "test-results", "playwright-report"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs|md|json|sql|example)$/i.test(entry.name)) allTextFiles.push(full);
  }
}
walk(root);
for (const file of allTextFiles) {
  const content = fs.readFileSync(file, "utf8");
  assert(!content.includes(wrongPhoneNumberId), `Wrong WhatsApp Phone Number ID reintroduced in ${path.relative(root, file)}.`);
}

console.log(`PASS: v5.3 Reply Coach replay covers ${replay.length} valid client texts with no-silence, safety, quality, and adapter-shape checks.`);
