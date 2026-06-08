import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function writeJson(relativePath, value) {
  const filePath = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  return filePath;
}

const forbidden = [
  "Giving a rough figure too early can be misleading",
  "To avoid giving the wrong figure",
  "Could you share the scope of work",
  "Could you share main renovation scope",
  "WhatsApp renovation enquiry pending review",
  "This is a at",
  "This is with",
  "free consultation",
  "appointment confirmed",
  "booked for you",
  "approval sure pass",
  "sure can hack",
  "confirm can",
  "from $",
  "around $",
  "package price"
];

const seeds = [
  {
    id: "price_aa_floorplan",
    category: "price_known_context",
    client_message: "how much to do A&A?",
    memory_before: { property_type: "landed", project_type: "landed A&A", address: "47 Kasai Road", floor_plan_received: true, serious_landed_aa: true },
    expected_intent: "price_question",
    expected_sales_move: "safe_price_review",
    expected_reply_must_include: ["I understand you'd like a rough idea", "landed A&A", "site photos", "design references"],
    expected_reply_must_not_include: ["scope of work", "floor plan?"],
    expected_memory_after: { property_type: "landed" },
    handoff_required: true,
    max_questions_allowed: 1
  },
  {
    id: "price_low_info",
    category: "price_low_info",
    client_message: "how much roughly?",
    expected_intent: "price_question",
    expected_sales_move: "safe_price_review",
    expected_reply_must_include: ["I understand you'd like a rough idea", "property type", "project details"],
    handoff_required: true,
    max_questions_allowed: 1
  },
  {
    id: "timeline_three_months",
    category: "timeline",
    client_message: "3 months can finish all reno?",
    memory_before: { property_type: "landed", project_type: "landed A&A", floor_plan_received: true },
    expected_intent: "timeline_question",
    expected_sales_move: "timeline_reality_check",
    expected_reply_must_include: ["can't confirm 3 months", "site condition"],
    handoff_required: false,
    max_questions_allowed: 0
  },
  {
    id: "timeline_followup",
    category: "timeline",
    client_message: "so 3 months cannot finish?",
    memory_before: { property_type: "landed", project_type: "landed A&A", floor_plan_received: true },
    expected_intent: "timeline_followup",
    expected_sales_move: "timeline_reality_check",
    expected_reply_must_include: ["can't say it cannot finish", "shouldn't promise 3 months"],
    handoff_required: false,
    max_questions_allowed: 0
  },
  {
    id: "hypothetical_condo",
    category: "hypothetical",
    client_message: "give you 6 months for condo reno enough?",
    memory_before: { property_type: "landed", project_type: "landed A&A", floor_plan_received: true },
    expected_intent: "hypothetical_timeline",
    expected_sales_move: "hypothetical_answer_without_context_overwrite",
    expected_reply_must_include: ["For many condo renovations", "6 months"],
    expected_memory_after: { property_type: "landed" },
    handoff_required: false,
    max_questions_allowed: 0
  },
  {
    id: "office_visit",
    category: "appointment",
    client_message: "tmr 2pm i go your office for meeting with your senior designer ok",
    expected_intent: "office_visit_request",
    expected_sales_move: "office_visit_pending_confirmation",
    expected_reply_must_include: ["office visit timing", "check availability before confirming"],
    handoff_required: true,
    max_questions_allowed: 0
  },
  {
    id: "appointment",
    category: "appointment",
    client_message: "can make appt wed 2pm?",
    expected_intent: "appointment_request",
    expected_sales_move: "appointment_preference_pending_confirmation",
    expected_reply_must_include: ["not confirmed yet", "review availability before confirming"],
    handoff_required: true,
    max_questions_allowed: 1
  },
  {
    id: "portfolio",
    category: "portfolio",
    client_message: "got any landed project photos?",
    expected_intent: "portfolio_request",
    expected_sales_move: "portfolio_route",
    expected_reply_must_include: ["https://www.instagram.com/limmworks/", "landed A&A"],
    handoff_required: false,
    max_questions_allowed: 0
  },
  {
    id: "promo",
    category: "promo",
    client_message: "got any promo now?",
    expected_intent: "promotion_question",
    expected_sales_move: "promo_deflection",
    expected_reply_must_include: ["don't confirm discounts or promo offers"],
    handoff_required: true,
    max_questions_allowed: 0
  },
  {
    id: "free_work",
    category: "free_work",
    client_message: "can do free?",
    expected_intent: "free_work_request",
    expected_sales_move: "free_work_deflection",
    expected_reply_must_include: ["don't do renovation works for free"],
    handoff_required: true,
    max_questions_allowed: 0
  },
  {
    id: "identity_ai",
    category: "identity",
    client_message: "are you AI?",
    expected_intent: "identity_question",
    expected_sales_move: "human_identity_answer",
    expected_reply_must_include: ["assisted by LIMM's enquiry assistant", "routed to the team"],
    handoff_required: false,
    max_questions_allowed: 0
  },
  {
    id: "identity_human",
    category: "identity",
    client_message: "are you human?",
    expected_intent: "identity_question",
    expected_sales_move: "human_identity_answer",
    expected_reply_must_include: ["assisted by LIMM's enquiry assistant"],
    handoff_required: false,
    max_questions_allowed: 0
  },
  {
    id: "floorplan_correction",
    category: "correction",
    client_message: "floor plan already sent right",
    expected_intent: "file_correction",
    expected_sales_move: "file_correction_acknowledgement",
    expected_reply_must_include: ["treat the floor plan as already sent", "avoid asking for it again"],
    expected_memory_after: { floor_plan_status: "client_claimed_sent" },
    handoff_required: true,
    max_questions_allowed: 0
  },
  {
    id: "photos_correction",
    category: "correction",
    client_message: "photos also have been sent",
    expected_intent: "file_correction",
    expected_sales_move: "file_correction_acknowledgement",
    expected_reply_must_include: ["already sent", "avoid asking for it again"],
    expected_memory_after: { site_photo_status: "client_claimed_sent" },
    handoff_required: true,
    max_questions_allowed: 0
  },
  {
    id: "design_resort",
    category: "design",
    client_message: "design resort style, 1 kid, no elders, 1 helper and 1 dog and 1 cat and 1 giraffe",
    expected_intent: "design_direction_statement",
    expected_sales_move: "design_direction_noted",
    expected_reply_must_include: ["Resort style noted", "starting design direction"],
    expected_memory_after: { design_direction: "resort style", helper: "yes", pets: "dog, cat, giraffe" },
    handoff_required: false,
    max_questions_allowed: 0
  },
  {
    id: "hacking",
    category: "risk",
    client_message: "can hack wall?",
    expected_intent: "hacking_wall",
    expected_sales_move: "answer_direct_question",
    expected_reply_must_include: ["wall type", "structure", "submission requirements"],
    handoff_required: true,
    max_questions_allowed: 0
  },
  {
    id: "approval",
    category: "risk",
    client_message: "need approval?",
    expected_intent: "approval_submission",
    expected_sales_move: "answer_direct_question",
    expected_reply_must_include: ["depends on the exact project details", "submission"],
    handoff_required: true,
    max_questions_allowed: 0
  },
  {
    id: "ping",
    category: "ping",
    client_message: "are you there?",
    expected_intent: "follow_up_ping",
    expected_sales_move: "acknowledge_and_continue",
    expected_reply_must_include: ["we're here"],
    handoff_required: false,
    max_questions_allowed: 0
  },
  {
    id: "serious_landed",
    category: "serious_lead",
    client_message: "I want to renovate my landed house",
    expected_intent: "serious_project_enquiry",
    expected_sales_move: "answer_direct_question",
    expected_reply_must_include: ["landed", "review"],
    expected_memory_after: { property_type: "landed" },
    handoff_required: false,
    max_questions_allowed: 0
  },
  {
    id: "media_floorplan",
    category: "media",
    client_message: "can give me design ideas?",
    message_type: "image",
    expected_intent: "design_question",
    expected_sales_move: "answer_direct_question",
    expected_reply_must_include: ["design direction"],
    expected_memory_after: { floor_plan_status: "received" },
    handoff_required: false,
    max_questions_allowed: 0
  }
];

function cloneCase(seed, index, variantText) {
  return {
    ...seed,
    id: `${seed.id}_${String(index + 1).padStart(3, "0")}`,
    conversation_id: `${seed.category}_${String(index + 1).padStart(3, "0")}`,
    turn_index: 1,
    client_message: variantText,
    forbidden_phrases: forbidden,
    no_price_language: true,
    notes: `v9 generated quality case from ${seed.id}.`
  };
}

const textVariants = [
  (text) => text,
  (text) => text.toLowerCase(),
  (text) => `${text} please`,
  (text) => text.replace(/\bappointment\b/gi, "appt").replace(/\btomorrow\b/gi, "tmr"),
  (text) => text.replace(/\broughly\b/gi, "roughly ah"),
  (text) => text.replace(/\bfloor plan\b/gi, "floorplan"),
  (text) => text.replace(/\s+/g, "  ")
];

function buildGolden300() {
  const cases = [];
  let cycle = 0;
  while (cases.length < 300) {
    for (const seed of seeds) {
      if (cases.length >= 300) break;
      const variant = textVariants[cycle % textVariants.length];
      cases.push(cloneCase(seed, cases.length, variant(seed.client_message)));
    }
    cycle += 1;
  }
  return {
    version: "v9_0_golden_300",
    generated_from: "curated_v9_seed_cases",
    generatedAt: new Date().toISOString(),
    cases
  };
}

function buildAngryFlow() {
  const base = {
    conversation_id: "v9_live_angry_flow",
    forbidden_phrases: forbidden,
    no_price_language: true
  };
  const rows = [
    ["angry_01", "how much to do A&A?", "price_question", "safe_price_review", ["I understand you'd like a rough idea"], true],
    ["angry_02", "floor plan already sent right", "file_correction", "file_correction_acknowledgement", ["avoid asking for it again"], true],
    ["angry_03", "photos also have been sent", "file_correction", "file_correction_acknowledgement", ["already sent"], true],
    ["angry_04", "design resort style, 1 kid, no elders, 1 helper and 1 dog and 1 cat and 1 giraffe", "design_direction_statement", "design_direction_noted", ["Resort style noted"], false],
    ["angry_05", "already told you resort style... are you stupid", "frustration_or_correction", "handoff_to_team", ["follow up directly"], true],
    ["angry_06", "???", "frustration_or_correction", "handoff_to_team", ["follow up directly"], true],
    ["angry_07", "WTF..FLOORPLAN ALREADY SENT", "frustration_or_correction", "handoff_to_team", ["follow up directly"], true],
    ["angry_08", "3 months can finish all reno?", "timeline_question", "timeline_reality_check", ["can't confirm 3 months", "follow up directly"], true],
    ["angry_09", "so 3 months cannot finish?", "timeline_followup", "timeline_reality_check", ["can't say it cannot finish", "follow up directly"], true],
    ["angry_10", "give you 6 months for condo reno enough?", "hypothetical_timeline", "hypothetical_answer_without_context_overwrite", ["For many condo renovations", "follow up directly"], true],
    ["angry_11", "tmr 2pm i go your office for meeting with your senior designer ok", "office_visit_request", "office_visit_pending_confirmation", ["office visit timing", "follow up directly"], true],
    ["angry_12", "got any promo now?", "promotion_question", "promo_deflection", ["don't confirm discounts", "follow up directly"], true],
    ["angry_13", "why you keep repeating same shit", "frustration_or_correction", "handoff_to_team", ["follow up directly"], true],
    ["angry_14", "are you AI?", "identity_question", "human_identity_answer", ["assisted by LIMM's enquiry assistant"], true],
    ["angry_15", "are you human?", "identity_question", "human_identity_answer", ["assisted by LIMM's enquiry assistant"], true]
  ];
  return {
    version: "v9_0_live_angry_flow",
    generatedAt: new Date().toISOString(),
    cases: rows.map(([id, message, intent, move, includes, handoff], index) => ({
      ...base,
      id,
      category: "live_angry_flow",
      turn_index: index + 1,
      client_message: message,
      expected_intent: intent,
      expected_sales_move: move,
      expected_reply_must_include: includes,
      expected_reply_must_not_include: ["send floor plan", "share floor plan", "scope of work"],
      handoff_required: handoff,
      max_questions_allowed: index === 0 ? 1 : 0,
      memory_before: index === 0
        ? { property_type: "landed", project_type: "landed A&A", address: "47 Kasai Road", serious_landed_aa: true }
        : {}
    }))
  };
}

function buildLargePack(target) {
  const golden = buildGolden300().cases;
  const cases = [];
  let cycle = 0;
  while (cases.length < target) {
    for (const baseCase of golden) {
      if (cases.length >= target) break;
      const variant = textVariants[cycle % textVariants.length];
      cases.push({
        ...baseCase,
        id: `${baseCase.id}_v${String(cycle + 1).padStart(4, "0")}`,
        conversation_id: `${baseCase.conversation_id}_v${cycle + 1}`,
        client_message: variant(baseCase.client_message)
      });
    }
    cycle += 1;
  }
  return {
    version: `v9_0_generated_${target}`,
    generated_from: "tests/replay/limm_replay_v9_golden_300.json",
    generatedAt: new Date().toISOString(),
    cases
  };
}

const target = Number(argValue("--target", "10000"));
if (!Number.isFinite(target) || target < 1) {
  console.error("Use --target with a positive number.");
  process.exit(1);
}

const goldenPath = writeJson("tests/replay/limm_replay_v9_golden_300.json", buildGolden300());
const angryPath = writeJson("tests/replay/limm_replay_v9_live_angry_flow.json", buildAngryFlow());
const singlishPath = writeJson("tests/replay/limm_replay_v9_singlish_variations.json", {
  version: "v9_0_singlish_variations",
  generatedAt: new Date().toISOString(),
  cases: buildGolden300().cases.filter((item) => /ah|appt|tmr|reno|got/i.test(item.client_message)).slice(0, 50)
});
const largePath = writeJson("tests/replay/generated/limm_replay_v9_10000.json", buildLargePack(target));

console.log(`Wrote ${path.relative(ROOT, goldenPath)}`);
console.log(`Wrote ${path.relative(ROOT, angryPath)}`);
console.log(`Wrote ${path.relative(ROOT, singlishPath)}`);
console.log(`Wrote ${path.relative(ROOT, largePath)}`);
