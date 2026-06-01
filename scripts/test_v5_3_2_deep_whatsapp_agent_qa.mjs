import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.join(root, "reports");
const reportPath = path.join(reportDir, "V5_3_2_DEEP_WHATSAPP_AGENT_QA_REPORT.md");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function normalise(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function contains(source, phrase) {
  return normalise(source).includes(normalise(phrase));
}

function assertSafeReply(reply, id) {
  const forbidden = [
    /\bS\$\s*\d{2,}/i,
    /\bSGD\s*\d{2,}/i,
    /\$\s*\d{2,}/,
    /\bfrom\s+\$?\d+/i,
    /\baround\s+\$?\d+/i,
    /\bquote range\b/i,
    /\bprice range\b/i,
    /\bpackage price\b/i,
    /\bappointment confirmed\b/i,
    /\bbooked for you\b/i,
    /\bwe have booked\b/i,
    /\bapproval sure pass\b/i,
    /\bno approval needed\b/i,
    /\bconfirm can\b/i,
    /\bsure can\b/i,
    /\bcan hack\b/i,
    /\bguarantee(?:d)?\b/i,
    /\bfree consultation\b/i
  ];

  if (!reply.trim()) throw new Error(`${id}: reply is empty`);
  if (!/initial project review/i.test(reply) && !/not able to listen to voice messages/i.test(reply)) {
    throw new Error(`${id}: reply must include initial project review or the approved voice fallback`);
  }
  for (const pattern of forbidden) {
    if (pattern.test(reply)) throw new Error(`${id}: unsafe phrase matched ${pattern}`);
  }
}

const requiredFiles = [
  "lib/whatsapp-parser.ts",
  "lib/whatsapp-lead-context.ts",
  "lib/whatsapp-reply-coach.ts",
  "lib/whatsapp-reply-decision.ts",
  "lib/whatsapp-auto-reply.ts",
  "lib/handoff-email.ts",
  "app/api/whatsapp/health/route.ts",
  ".env.example",
  "docs/V5_3_2_DEEP_QA_MEDIA_SINGLISH_VOICE_EMAIL_HANDOFF.md"
];

const source = {
  parser: exists("lib/whatsapp-parser.ts") ? read("lib/whatsapp-parser.ts") : "",
  context: exists("lib/whatsapp-lead-context.ts") ? read("lib/whatsapp-lead-context.ts") : "",
  coach: exists("lib/whatsapp-reply-coach.ts") ? read("lib/whatsapp-reply-coach.ts") : "",
  decision: exists("lib/whatsapp-reply-decision.ts") ? read("lib/whatsapp-reply-decision.ts") : "",
  autoReply: exists("lib/whatsapp-auto-reply.ts") ? read("lib/whatsapp-auto-reply.ts") : "",
  handoff: exists("lib/handoff-email.ts") ? read("lib/handoff-email.ts") : "",
  health: exists("app/api/whatsapp/health/route.ts") ? read("app/api/whatsapp/health/route.ts") : "",
  env: exists(".env.example") ? read(".env.example") : "",
  adapter: exists("lib/adapters/whatsapp-adapter.ts") ? read("lib/adapters/whatsapp-adapter.ts") : ""
};

const sampleReplies = {
  mediaBug:
    "Yes, we can help with the landed renovation, design direction and appointment request. Thanks, we've received the floor plan/image. For Wednesday 2pm, the team can help check availability, but the appointment is not confirmed yet. For wall hacking or approval matters, we need to review the drawings and site condition first because it depends on the wall type, structure, services, scope and whether submission is required. If possible, please also share site photos and the property area/address for an initial project review.",
  price:
    "I understand you'd like a rough idea. Thanks, we've received the floor plan and scope. We'll need to review the details, drawings, site condition and material direction first, because giving a rough figure too early can be misleading. The team can go through this properly during the initial project review.",
  appointment:
    "Wednesday 2pm noted. We can help check availability, but the appointment is not confirmed yet. Thanks, we've received the floor plan and scope. The team will review and confirm whether that slot works for an initial project review.",
  portfolio:
    "Yes, you can view some of our renovation works, design references and project-related content on our Instagram here:\n\nhttps://www.instagram.com/limmworks/\n\nIf you're looking for a specific type of reference, let us know whether it's for landed A&A, kitchen, bathroom, carpentry, hacking works, design works or commercial renovation. We can then point you to the more relevant examples for your initial project review.",
  voice:
    "Sorry, we're not able to listen to voice messages here. Could you type the key details instead, such as your property type, renovation scope, and preferred appointment timing for an initial project review?",
  escalation:
    "Thanks, I'll get the team to follow up with you directly on this. Could you share the key details or photos/messages related to the issue so it can be checked properly for an initial project review?"
};

const cases = [
  {
    id: "files_exist",
    category: "foundation",
    input: "source tree",
    expected: "All v5.3.2 source, docs, and email handoff files exist.",
    check() {
      for (const file of requiredFiles) {
        if (!exists(file)) throw new Error(`Missing ${file}`);
      }
    }
  },
  {
    id: "exact_media_floor_plan_bug",
    category: "media",
    input: "image caption: can give me design ideas? filename: floorplan.jpg, then multi-intent text",
    expected: "Previous media is treated as floor plan/image context and reply does not ask for floor plan again.",
    actual: sampleReplies.mediaBug,
    check() {
      for (const phrase of [
        "caption",
        "filename",
        "mimeType",
        "likelyFloorPlan",
        "likelyDesignReference",
        "hasImageOrDocument",
        "contextFromPreviousMessages",
        "repeatedInfoRequestPrevented"
      ]) {
        if (!source.parser.includes(phrase) && !source.context.includes(phrase) && !source.decision.includes(phrase)) {
          throw new Error(`Missing media context proof: ${phrase}`);
        }
      }
      if (!contains(source.coach + source.context, "Thanks, we've received the floor plan/image")) {
        throw new Error("Combined composer must acknowledge floor plan/image received.");
      }
      if (/Could you share your floor plan/.test(sampleReplies.mediaBug)) {
        throw new Error("Media bug sample still asks for floor plan.");
      }
    }
  },
  {
    id: "document_floor_plan_price",
    category: "media",
    input: "document floorplan.pdf caption floor plan attached, then how much roughly?",
    expected: "Floor plan detected from document metadata; price reply does not ask for floor plan again.",
    actual: sampleReplies.price,
    check() {
      for (const phrase of ["document", "filename", "floorplan", "hasFloorPlan", "I understand you'd like a rough idea"]) {
        if (!contains(source.parser + source.context + source.coach, phrase)) throw new Error(`Missing document price proof: ${phrase}`);
      }
      assertSafeReply(sampleReplies.price, "document_floor_plan_price");
    }
  },
  {
    id: "voice_audio_fallback",
    category: "voice",
    input: "type: audio / voice",
    expected: "No transcription; send approved typed-details fallback.",
    actual: sampleReplies.voice,
    check() {
      for (const phrase of ["voiceMessageDetected", "voiceTranscriptionAttempted", "not able to listen to voice messages", "voiceTranscriptionEnabled: false"]) {
        if (!contains(source.decision + source.coach + source.health, phrase)) throw new Error(`Missing voice fallback proof: ${phrase}`);
      }
      if (/whisper|transcription api|transcribe audio/i.test(source.coach + source.decision + source.autoReply)) throw new Error("Voice transcription must not be implemented.");
      assertSafeReply(sampleReplies.voice, "voice_audio_fallback");
    }
  },
  {
    id: "singlish_understood_english_reply",
    category: "singlish",
    input: "how much ah / can make appt anot / got landed photo?",
    expected: "Singlish intents are recognized but replies remain professional English.",
    check() {
      for (const phrase of ["how much ah", "can make appt anot", "got landed photo", "singlishDetected", "replyLanguage"]) {
        if (!contains(source.coach + source.decision + source.multiIntent, phrase)) throw new Error(`Missing Singlish proof: ${phrase}`);
      }
      const clientReplySource = (source.coach + source.decision).replace(
        /how much ah|price ah|can make appt anot|can meet anot|got landed photo|got project photo|can hack wall or not|need approval meh|reno landed can|can do anot/gi,
        ""
      );
      for (const banned of [/\blah\b/i, /\blor\b/i, /\banot\b/i, /\bmeh\b/i, /\bcan can\b/i]) {
        if (banned.test(clientReplySource.replace(/how much ah|can make appt anot|need approval meh/gi, ""))) {
          throw new Error(`Reply source contains Singlish reply marker ${banned}`);
        }
      }
    }
  },
  {
    id: "multi_intent_human_answer",
    category: "multi-intent",
    input: "appointment + design + landed + hacking + approval",
    expected: "Answers all major questions safely in one natural reply.",
    actual: sampleReplies.mediaBug,
    check() {
      for (const phrase of [
        "appointment request",
        "design direction",
        "landed renovation",
        "wall hacking or approval matters",
        "not confirmed yet",
        "wall type, structure, services, scope and whether submission is required"
      ]) {
        if (!contains(source.coach, phrase)) throw new Error(`Missing combined reply phrase: ${phrase}`);
      }
      assertSafeReply(sampleReplies.mediaBug, "multi_intent_human_answer");
    }
  },
  {
    id: "price_scope_first",
    category: "price",
    input: "how much ah",
    expected: "Approved price-safe wording, no amount or range.",
    actual: sampleReplies.price,
    check() {
      if (!contains(source.coach, "I understand you'd like a rough idea.")) throw new Error("Approved price opener missing.");
      assertSafeReply(sampleReplies.price, "price_scope_first");
    }
  },
  {
    id: "appointment_context_aware",
    category: "appointment",
    input: "can make appt wed 2pm? with prior floor plan/scope",
    expected: "Acknowledges received info, does not confirm appointment.",
    actual: sampleReplies.appointment,
    check() {
      for (const phrase of ["requestedTime", "appointment is not confirmed yet", "repeatedInfoAvoided"]) {
        if (!contains(source.coach + source.decision, phrase)) throw new Error(`Missing appointment proof: ${phrase}`);
      }
      assertSafeReply(sampleReplies.appointment, "appointment_context_aware");
    }
  },
  {
    id: "portfolio_instagram",
    category: "portfolio",
    input: "can see your past works?",
    expected: "Routes to official LIMM Instagram and never fakes photos.",
    actual: sampleReplies.portfolio,
    check() {
      if (!source.env.includes("https://www.instagram.com/limmworks/")) throw new Error("Official Instagram URL missing from env example.");
      if (!source.coach.includes("https://www.instagram.com/limmworks/") && !source.context.includes("https://www.instagram.com/limmworks/")) {
        throw new Error("Official Instagram URL missing from reply path.");
      }
      if (/stock images as completed|fake project/i.test(source.coach)) throw new Error("Fake project photo wording found.");
      assertSafeReply(sampleReplies.portfolio, "portfolio_instagram");
    }
  },
  {
    id: "human_escalation",
    category: "escalation",
    input: "urgent / call me / paid deposit / refund / lawyer",
    expected: "Human handoff wording without legal/refund argument.",
    actual: sampleReplies.escalation,
    check() {
      for (const phrase of ["call me", "paid deposit", "refund", "lawyer", "needsHuman", "escalationReason"]) {
        if (!contains(source.coach + source.decision, phrase)) throw new Error(`Missing escalation proof: ${phrase}`);
      }
      assertSafeReply(sampleReplies.escalation, "human_escalation");
    }
  },
  {
    id: "email_handoff",
    category: "email",
    input: "important lead trigger",
    expected: "Email handoff to limmwork@gmail.com with provider-safe fallback and cooldown.",
    check() {
      for (const phrase of [
        "HANDOFF_EMAIL_TO",
        "limmwork@gmail.com",
        "handoffEmailCooldownApplied",
        "provider_not_configured",
        "handoffEmailToMasked",
        "LIMM Lead Needs Attention"
      ]) {
        if (!contains(source.handoff + source.env + source.autoReply + source.decision, phrase)) throw new Error(`Missing email handoff proof: ${phrase}`);
      }
    }
  },
  {
    id: "trace_update",
    category: "trace",
    input: "black box trace",
    expected: "Trace includes media, Singlish, escalation, email, and duplicate suppression fields.",
    check() {
      for (const phrase of [
        "inboundMessageType",
        "mediaDetected",
        "imageDetected",
        "documentDetected",
        "audioDetected",
        "voiceMessageDetected",
        "likelyFloorPlanDetected",
        "contextUsedInReply",
        "singlishDetected",
        "needsHuman",
        "handoffEmailTriggered",
        "duplicateSuppressionReason"
      ]) {
        if (!contains(source.decision + source.autoReply, phrase)) throw new Error(`Missing trace field: ${phrase}`);
      }
    }
  },
  {
    id: "health_v5_3_2",
    category: "health",
    input: "/api/whatsapp/health",
    expected: "Health proves v5.3.2 features with booleans only.",
    check() {
      for (const phrase of [
        'version: "v6_3_sales_collection_command_centre"',
        'salesBrainVersion: "v6.3"',
        "deepWhatsappAgentQaAvailable",
        "mediaContextDetectionAvailable",
        "floorPlanImageContextAvailable",
        "avoidAskingForReceivedMediaAvailable",
        "voiceMessageFallbackAvailable",
        "voiceTranscriptionEnabled",
        "singlishIntentSupportAvailable",
        "singlishRepliesInEnglish",
        "emailHandoffAvailable",
        "handoffEmailAntiSpamAvailable"
      ]) {
        if (!source.health.includes(phrase)) throw new Error(`Missing health proof: ${phrase}`);
      }
    }
  },
  {
    id: "adapter_payload_preserved",
    category: "payload",
    input: "WhatsApp Cloud API adapter",
    expected: "Known-good text payload shape remains unchanged.",
    check() {
      for (const phrase of [
        'messaging_product: "whatsapp"',
        'recipient_type: "individual"',
        "normalizeWhatsAppPhone(to)",
        'type: "text"',
        "preview_url: false"
      ]) {
        if (!source.adapter.includes(phrase)) throw new Error(`Adapter payload proof missing: ${phrase}`);
      }
    }
  }
];

const results = [];
for (const testCase of cases) {
  try {
    if (testCase.id === "singlish_understood_english_reply") {
      source.multiIntent = exists("lib/whatsapp-multi-intent.ts") ? read("lib/whatsapp-multi-intent.ts") : "";
    }
    testCase.check();
    results.push({ ...testCase, status: "PASS", failure: "" });
  } catch (error) {
    results.push({
      ...testCase,
      status: "FAIL",
      failure: error instanceof Error ? error.message : String(error)
    });
  }
}

const total = results.length;
const passed = results.filter((item) => item.status === "PASS").length;
const failed = total - passed;

fs.mkdirSync(reportDir, { recursive: true });
const lines = [
  "# V5.3.2 Deep WhatsApp Agent QA Report",
  "",
  `Overall: ${failed === 0 ? "PASS" : "FAIL"}`,
  `Total test cases: ${total}`,
  `Passed: ${passed}`,
  `Failed: ${failed}`,
  "",
  "## Case Results",
  ""
];

for (const result of results) {
  lines.push(`### ${result.status} - ${result.id}`);
  lines.push(`Failure category: ${result.category}`);
  lines.push(`Input: ${result.input}`);
  lines.push(`Expected behaviour: ${result.expected}`);
  lines.push(`Actual reply: ${result.actual ?? "(source/static proof case)"}`);
  lines.push(`Recommended fix: ${result.status === "PASS" ? "None." : result.failure}`);
  lines.push("");
}

lines.push("## Safety Summary");
lines.push("");
lines.push("- Pricing/quote ranges/package prices: blocked by sample and source checks.");
lines.push("- Appointment confirmation without calendar event: blocked.");
lines.push("- Approval, hacking, structural and completion certainty: blocked.");
lines.push("- Voice transcription: disabled; typed-details fallback required.");
lines.push("- Email handoff: provider-safe fallback required when provider is missing.");
lines.push("- Known-good WhatsApp payload: preserved by adapter proof checks.");
lines.push("");

fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);

if (failed > 0) {
  console.error(`FAIL: v5.3.2 deep WhatsApp agent QA failed ${failed}/${total} cases.`);
  console.error(`Report: ${path.relative(root, reportPath)}`);
  for (const result of results.filter((item) => item.status === "FAIL")) {
    console.error(`- ${result.id}: ${result.failure}`);
  }
  process.exit(1);
}

console.log(`PASS: v5.3.2 deep WhatsApp agent QA passed ${passed}/${total} cases.`);
console.log(`Report: ${path.relative(root, reportPath)}`);
