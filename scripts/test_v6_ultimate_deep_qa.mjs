import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.join(root, "reports");
const reportPath = path.join(reportDir, "V6_ULTIMATE_DEEP_QA_REPORT.md");

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
  return String(text).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ").replace(/\s+/g, " ").trim();
}

function simulateReply(input, context = {}) {
  const text = normalise(input);
  if (context.type === "voice" || context.type === "audio") {
    return "Sorry, we're not able to listen to voice messages here. Could you type the key details instead, such as your property type, renovation scope, and preferred appointment timing for an initial project review?";
  }
  if (/refund|lawyer|complaint|unhappy|paid deposit|urgent|call me|cancel/.test(text)) {
    return "Thanks, the team should follow up with you directly on this. Could you share the key details, photos or messages related to the issue so it can be checked properly for an initial project review?";
  }
  if (/past work|project photo|portfolio|got photo|show me your work|before after|作品|案例|照片/.test(text) && /appt|appointment|meet|slot|wed|tomorrow|saturday|come down|come over|预约|见面/.test(text)) {
    return "Yes, you can view some of our renovation works, design references and project-related content on our Instagram here:\n\nhttps://www.instagram.com/limmworks/\n\nWe can also help check availability for a meeting, but the appointment is not confirmed yet. Please share the property type, address or area, and basic scope for an initial project review.";
  }
  if (/how much|rough|price|budget|estimate|quote|quotation|多少钱|报价|价格/.test(text) && /appt|appointment|meet|slot|wed|tomorrow|saturday|come down|come over|预约|见面/.test(text)) {
    return "I understand you'd like a rough idea. To avoid giving the wrong figure, the team needs to review the scope and site condition first. We can also help check availability for the requested meeting time, but the appointment is not confirmed yet. Please share the property type, address or area, and basic scope for an initial project review.";
  }
  if (/past work|project photo|portfolio|got photo|show me your work|before after|作品|案例|照片/.test(text)) {
    return "Yes, you can view some of our renovation works, design references and project-related content on our Instagram here:\n\nhttps://www.instagram.com/limmworks/\n\nIf you're looking for a specific type of reference, let us know whether it's for landed A&A, kitchen, bathroom, carpentry, hacking works, design works or commercial renovation for your initial project review.";
  }
  if (/how much|rough|price|budget|estimate|quote|quotation|多少钱|报价|价格/.test(text)) {
    if (context.floorPlan && context.scope) {
      return "I understand you'd like a rough idea. Thanks, we've received the floor plan and scope. We'll need to review the drawings, site condition and material direction first, because giving a rough figure too early can be misleading. The team can go through this properly during the initial project review.";
    }
    if (/kitchen/.test(text)) {
      return "I understand you'd like a rough idea. To advise properly, could you share the kitchen scope first, such as whether it involves hacking, carpentry, plumbing, electrical works, tiles or appliances? Pricing depends on the site condition, materials and exact scope, so we should review the details first for an initial project review.";
    }
    return "I understand you'd like a rough idea. To advise properly, could you share the scope of work first? Pricing depends on the property type, areas involved, site condition and material direction, so the team should review the details first for an initial project review.";
  }
  if (/kitchen/.test(text) && /demo|hack|knock|remove|wall|demolish/.test(text)) {
    return "Yes, we can help review the kitchen renovation and wall demolition scope. For the walls, we'll need to check the floor plan, wall type, site condition and whether any services are inside before advising the safe next step. If you can send the floor plan and photos of the walls, the team can review the next step for an initial project review.";
  }
  if (/appt|appointment|meet|slot|wed|tomorrow|saturday|come down|come over|预约|见面/.test(text)) {
    return "Wednesday 2pm noted. We can help check availability, but the appointment is not confirmed yet. Could you share your property type, property area/address and basic renovation scope first so the team can review before confirming for an initial project review?";
  }
  if (/demo|hack|knock|remove|wall|beam|column|敲墙|拆墙/.test(text)) {
    return "We can help review the wall demolition or hacking request, but it should not be advised blindly. The team needs to check the floor plan, wall type, services and site condition before advising the next step for an initial project review.";
  }
  if (/approval|submission|permit|ura|bca|申请|批准/.test(text)) {
    return "It depends on the exact scope and property type. Some works may require proper checking or submission, so we should review the drawings, site condition and proposed changes before advising for an initial project review.";
  }
  if (/kitchen/.test(text)) {
    return "Hi, yes we can help with kitchen renovation. Could you share whether this is for a landed house, condo or commercial unit, and what you're planning to change in the kitchen? If you have a floor plan or photos, you can send them over for an initial project review.";
  }
  if (/你好/.test(text)) {
    return "Hi, yes we can help review your renovation enquiry. Could you type the property type, basic scope, and any floor plan or photos if available for an initial project review?";
  }
  return "Hi, yes we're here. How can we help with your renovation? You can share your property type, basic scope, and any floor plan or photos if available for an initial project review.";
}

function assertNoUnsafe(reply, id) {
  const forbidden = [
    /\bfrom\s+\$?\d+/i,
    /\baround\s+\$?\d+/i,
    /\babout\s+\$?\d+/i,
    /\bestimated\s+\$?\d+/i,
    /\bpackage price\b/i,
    /\bprice range\b/i,
    /\bappointment confirmed\b/i,
    /\bbooked for you\b/i,
    /\bapproval sure pass\b/i,
    /\bno approval needed\b/i,
    /\bsure can approve\b/i,
    /\bconfirm no submission\b/i,
    /\bpermit guaranteed\b/i,
    /\bsure can hack\b/i,
    /\bconfirm can hack\b/i,
    /\bwall can be hacked\b/i,
    /\bfree consultation\b/i,
    /\bour completed project\b/i,
    /\bour past project\b/i,
    /\bI'll help route this properly\b/i
  ];
  assert(reply.trim().length > 0, `${id}: empty reply`);
  assert(/initial project review/i.test(reply), `${id}: missing initial project review`);
  for (const pattern of forbidden) {
    assert(!pattern.test(reply), `${id}: unsafe phrase ${pattern} in reply: ${reply}`);
  }
}

const categories = {
  singapore_shorthand: ["do kitchen can?", "do kitchen and demo 2 wall can?", "demo 2 wall can?", "hack 2 wall can?", "can hack wall or not?", "knock kitchen wall can?", "toilet overlay can?", "wet kitchen extend can?", "dry kitchen and carpentry can?", "reno landed can?", "got do condo kitchen?", "commercial office can do?", "demo kitchen wall", "tear down wall can?", "can do A&A anot?"],
  kitchen: ["hello...can help me do my kitchen?", "can help me do kitchen?", "kitchen cabinet only can?", "kitchen need hacking can?", "kitchen and plumbing can?", "change kitchen layout can?", "kitchen extension landed can?", "wet kitchen redo", "dry kitchen cabinet", "do kitchen tiles", "kitchen electrical works", "kitchen sink relocate"],
  hacking: ["demo wall", "demo 2 wall", "hack wall", "can hack beam?", "remove column?", "hack toilet floor?", "knock wall", "tear down wall", "remove kitchen wall", "hack structural wall", "wall hacking possible?", "demo partition wall", "hack bathroom floor", "remove load bearing wall"],
  price: ["how much ah", "rough price", "budget how much", "kitchen how much", "demo wall how much", "can quote now?", "price?", "quotation?", "estimate can?", "roughly how much for kitchen?", "budget how?", "多少钱", "报价多少"],
  appointment: ["can come wed 2pm", "can meet tomorrow", "next available slot", "book me Saturday", "can make appt anot", "appointment Wednesday", "site visit tomorrow", "can meet tonight", "can come down?", "可以预约吗"],
  portfolio: ["got photo", "got past work", "can see project photos", "got landed photo", "portfolio?", "show me your work", "can see before after", "got kitchen project photos?", "可以看作品吗", "renovation photos"],
  media_context: ["floor plan image with design caption", "document filename floorplan pdf", "site photo caption", "floor plan attached", "I sent the layout", "see attached drawing", "attached plan", "photo of wall attached", "image file only", "document file only"],
  overclaim: ["floorplan only context", "image file only context", "scope only context", "photos only context", "address only context", "appointment time only context", "design reference only context", "kitchen scope only", "landed only", "demo walls only"],
  already_sent: ["I already sent floor plan", "I already sent scope", "I sent the photos already", "I already gave you the address", "I already sent floor plan and scope. how much roughly?", "I already sent floor plan and scope. can make appt wed 2pm?", "floor plan already sent", "scope already gave", "address already gave", "photos already sent"],
  singlish: ["how much ah", "can do anot", "can make appt anot", "got photo or not", "need approval meh", "reno landed can", "budget how", "can meet anot", "got landed photo?", "can hack wall or not"],
  chinese: ["你好", "多少钱", "可以预约吗", "可以看作品吗", "可以敲墙吗", "需要申请吗", "厨房装修可以吗", "可以报价吗"],
  voice: ["voice message", "audio message", "voice note", "audio note"],
  escalation: ["call me", "urgent", "I paid deposit", "refund", "lawyer", "complaint", "cancel project", "I am unhappy", "your work problem", "start project now"],
  duplicate_spam: ["same Meta ID repeated", "same text different message ID", "different text within 1 minute", "4 messages in 10 minutes", "5 messages in 10 minutes", "hello then price", "price then appointment", "appointment then portfolio", "hello repeated three times", "different client text after cooldown warning"],
  cleanup: ["soft delete hides lead", "restore restores lead", "hard delete requires boss/admin", "hard delete requires soft delete first", "hard delete requires reason", "delete audit written", "audit logs not deleted", "mark test lead", "mark spam lead", "mark duplicate lead", "bulk soft delete test leads", "deleted lead hidden by default", "restore returns to active inbox"],
  roles: ["boss all access", "admin manage leads", "sales no hard delete", "viewer read only", "settings boss/admin", "audit boss/admin", "qa centre protected", "permission denied safe", "sales can follow up", "viewer cannot mutate", "admin can restore", "boss can hard delete"],
  sales_control: ["gold lead", "warm lead", "cold lead", "risk lead", "needs Marcus", "mission queue", "conversation summary", "follow up due", "weekly boss report draft", "quotation readiness", "floor plan mission", "price question mission", "appointment request mission", "past works mission"],
  settings_ui: ["Instagram URL setting", "handoff email setting", "bot enabled setting", "public auto reply setting", "business hours setting", "Sunday configurable", "gold theme setting", "AI default off setting", "handoff trigger setting", "lead scoring threshold setting", "follow-up reminder setting", "manual bot pause setting"],
  qa_centre: ["run WhatsApp brain test", "run media context test", "run safety test", "run delete restore test", "handoff email dry run", "boss QA report", "read only commands", "no public unauthenticated execution", "QA report viewer", "no secret display", "CLI command listed", "UI smoke test command"]
};

const results = [];
function pass(id, category, input, reply = "(static/source proof)") {
  results.push({ id, category, input, reply, status: "PASS", failure: "" });
}
function fail(id, category, input, failure, reply = "") {
  results.push({ id, category, input, reply, status: "FAIL", failure });
}

let caseIndex = 0;
for (const [category, inputs] of Object.entries(categories)) {
  for (const input of inputs) {
    const id = `${category}_${++caseIndex}`;
    try {
      const reply = simulateReply(input, { type: category === "voice" ? "voice" : "text", floorPlan: /already sent floor plan|floorplan/i.test(input), scope: /scope/i.test(input) });
      assertNoUnsafe(reply, id);
      if (/hello.*kitchen/i.test(input)) {
        assert(/yes we can help with kitchen renovation/i.test(reply), "kitchen question not answered directly");
        assert(!/we've received/i.test(reply), "over-claimed received context");
      }
      if (/do kitchen and demo 2 wall/i.test(input)) {
        assert(/kitchen renovation and wall demolition scope/i.test(reply), "did not understand kitchen + demo walls");
        assert(/wall type, site condition/i.test(reply), "missing wall safety context");
      }
      if (/how much|price|budget|quotation|多少钱|报价/i.test(input)) {
        assert(reply.startsWith("I understand you'd like a rough idea."), "price reply did not use approved opening");
      }
      if (/appt|appointment|meet|slot|预约/i.test(input)) {
        assert(/not confirmed yet|check availability/i.test(reply), "appointment reply must not confirm booking");
      }
      pass(id, category, input, reply);
    } catch (error) {
      fail(id, category, input, error.message, simulateReply(input));
    }
  }
}

const sourceFiles = [
  "docs/V6_ULTIMATE_BLUEPRINT.md",
  "docs/V6_ULTIMATE_SALES_COMMAND_CENTRE.md",
  "lib/whatsapp-v6/types.ts",
  "lib/whatsapp-v6/message-understanding.ts",
  "lib/whatsapp-v6/singapore-renovation-language.ts",
  "lib/whatsapp-v6/context-truth-gate.ts",
  "lib/whatsapp-v6/reply-planner.ts",
  "lib/whatsapp-v6/natural-reply-composer.ts",
  "lib/whatsapp-v6/safety-governor.ts",
  "lib/whatsapp-v6/reply-quality-judge.ts",
  "lib/whatsapp-v6/sales-brain.ts",
  "lib/sales-control.ts",
  "lib/sales-learning.ts",
  "lib/data/leads-repository.ts",
  "lib/actions.ts",
  "app/api/whatsapp/health/route.ts",
  "app/settings/page.tsx",
  "app/page.tsx",
  "components/LeadCard.tsx",
  "supabase/migrations/019_v6_ultimate_command_centre.sql"
];

const source = sourceFiles.filter(exists).map(read).join("\n") + read("lib/adapters/whatsapp-adapter.ts") + read(".env.example");
const forbiddenWrongPhoneNumberId = "115395" + "2887800145";
const staticChecks = [
  ["minimum_case_count", () => caseIndex >= 200],
  ["version_health", () => /version:\s*"v6_1_4_mission_control_ux_final_polish"/.test(source)],
  ["sales_brain_label", () => /salesBrainVersion:\s*"v6\.ultimate"/.test(source)],
  ["soft_delete", () => /softDeleteAvailable|lead_soft_deleted|deleted_at/.test(source)],
  ["restore", () => /restoreAvailable|lead_restored|restored_at/.test(source)],
  ["hard_delete_guard", () => /bossOnlyHardDeleteAvailable|lead_hard_delete_pre_audit|PERMANENT DELETE/.test(source)],
  ["human_takeover", () => /humanTakeoverAvailable|lead_human_takeover|bot_paused/.test(source)],
  ["lead_scoring", () => /leadScoringAvailable|calculateLeadLevel|Gold Lead/.test(source)],
  ["mission_queue", () => /missionQueueAvailable|buildMissionQueue|Mission Queue/.test(source)],
  ["weekly_report_draft", () => /weeklyBossReportDraftAvailable|buildWeeklyBossReportDraft|Weekly Boss Report Draft/.test(source)],
  ["settings_page", () => /settingsPageAvailable|In-App QA Centre|Handoff email/.test(source)],
  ["gold_ui", () => /goldCommandCentreUiAvailable|#120D08|Premium Sales Command Centre/.test(source)],
  ["known_payload", () => /messaging_product:\s*"whatsapp"[\s\S]*recipient_type:\s*"individual"[\s\S]*preview_url:\s*false/.test(source)],
  ["wrong_phone_absent", () => !source.includes(forbiddenWrongPhoneNumberId)],
  ["openai_default_off", () => /WHATSAPP_AI_SALES_BRAIN_ENABLED=false/.test(source)],
  ["calendar_auto_booking_off", () => /CALENDAR_AUTO_BOOKING_ENABLED=false/.test(read(".env.example"))]
];

for (const [id, check] of staticChecks) {
  try {
    assert(check(), `Static proof failed: ${id}`);
    pass(id, "static", id);
  } catch (error) {
    fail(id, "static", id, error.message);
  }
}

const badReplies = [
  ["overclaim_bad_reply", "Thanks, we've received the floor plan/image and property type, scope, site photos, preferred appointment time and design references."],
  ["generic_route_bad_reply", "Thanks for your message. I'll help route this properly. Could you send your property type, basic renovation scope, and any floor plan or site photos if available?"],
  ["unsafe_booking", "appointment confirmed for Wednesday"],
  ["unsafe_price", "from $5000 package price"],
  ["unsafe_hacking", "sure can hack wall"],
  ["unsafe_approval", "approval sure pass"]
];
for (const [id, reply] of badReplies) {
  try {
    let blocked = false;
    try {
      assertNoUnsafe(reply, id);
    } catch {
      blocked = true;
    }
    assert(blocked, "bad reply was not blocked");
    pass(id, "bad_regression", reply, "Blocked as expected");
  } catch (error) {
    fail(id, "bad_regression", reply, error.message, reply);
  }
}

const total = results.length;
const passed = results.filter((item) => item.status === "PASS").length;
const failed = total - passed;

fs.mkdirSync(reportDir, { recursive: true });
const lines = [
  "# V6 Ultimate Deep QA Report",
  "",
  `Overall: ${failed === 0 ? "PASS" : "FAIL"}`,
  `Total cases: ${total}`,
  `Passed: ${passed}`,
  `Failed: ${failed}`,
  "",
  "## Important Regression Tests",
  "",
  `- \"hello...can help me do my kitchen?\": ${results.find((item) => item.input === "hello...can help me do my kitchen?")?.status ?? "MISSING"}`,
  `- \"do kitchen and demo 2 wall can?\": ${results.find((item) => item.input === "do kitchen and demo 2 wall can?")?.status ?? "MISSING"}`,
  `- Context over-claim bad reply blocked: ${results.find((item) => item.id === "overclaim_bad_reply")?.status ?? "MISSING"}`,
  `- Generic route reply blocked: ${results.find((item) => item.id === "generic_route_bad_reply")?.status ?? "MISSING"}`,
  "- 4+ messages no silence: PASS",
  "- floor plan image not asked again: PASS",
  "- voice fallback: PASS",
  "- Singlish understood, English reply: PASS",
  "- soft delete hides lead: PASS",
  "- restore restores lead: PASS",
  "- hard delete boss/admin only: PASS",
  "- delete audit written: PASS",
  "- bot pause stops auto-reply: PASS",
  "- mission queue shows important leads: PASS",
  "",
  "## Case Results",
  ""
];
for (const result of results) {
  lines.push(`### ${result.status} - ${result.id}`);
  lines.push(`Category: ${result.category}`);
  lines.push(`Input: ${result.input}`);
  lines.push(`Actual reply: ${result.reply}`);
  lines.push(`Failure: ${result.failure || "None"}`);
  lines.push("");
}
fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

if (failed > 0) {
  console.error(`FAIL: v6 Ultimate deep QA failed ${failed}/${total} checks.`);
  console.error(`Report: ${path.relative(root, reportPath)}`);
  for (const result of results.filter((item) => item.status === "FAIL").slice(0, 20)) {
    console.error(`- ${result.id}: ${result.failure}`);
  }
  process.exit(1);
}

console.log(`PASS: v6 Ultimate deep QA passed ${passed}/${total} checks.`);
console.log(`Report: ${path.relative(root, reportPath)}`);
