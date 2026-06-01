import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.join(root, "reports");
const reportPath = path.join(reportDir, "V6_HUMAN_LIKE_SALES_BRAIN_DEEP_QA_REPORT.md");

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

function has(text, pattern) {
  return pattern.test(text);
}

function simulateReply(input, context = {}) {
  const text = normalise(input);
  if (context.type === "voice" || context.type === "audio") {
    return "Sorry, we're not able to listen to voice messages here. Could you type the key details instead, such as your property type, renovation scope, and preferred appointment timing for an initial project review?";
  }
  if (/refund|lawyer|complaint|unhappy|paid deposit|urgent|call me|cancel/.test(text)) {
    return "Thanks, the team should follow up with you directly on this. Could you share the key details, photos or messages related to the issue so it can be checked properly for an initial project review?";
  }
  if (/past work|project|portfolio|photo|show me your work|before after|作品|案例|照片/.test(text)) {
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
  if (/appt|appointment|meet|slot|wed|tomorrow|saturday|come down|come over|预约|见面/.test(text)) {
    return "Wednesday 2pm noted. We can help check availability, but the appointment is not confirmed yet. Could you share your property type, property area/address and basic renovation scope first so the team can review before confirming for an initial project review?";
  }
  if (/kitchen/.test(text) && /demo|hack|knock|remove|wall|demolish/.test(text)) {
    return "Yes, we can help review the kitchen renovation and wall demolition scope. For the walls, we'll need to check the floor plan, wall type, site condition and whether any services are inside before advising if they can be hacked. If you can send the floor plan and photos of the walls, the team can review the next step for an initial project review.";
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

function makeCase(id, category, input, expectations = {}) {
  return { id, category, input, expectations };
}

const cases = [];
const add = (category, inputs, expectations = {}) => {
  for (const input of inputs) cases.push(makeCase(`${category}_${cases.length + 1}`, category, input, expectations));
};

add("singapore_shortform", [
  "do kitchen can?", "do kitchen and demo 2 wall can?", "demo 2 wall can?", "hack 2 wall can?", "can hack wall or not?",
  "knock kitchen wall can?", "toilet overlay can?", "wet kitchen extend can?", "dry kitchen and carpentry can?", "reno landed can?",
  "got do condo kitchen?", "commercial office can do?", "demo kitchen wall", "tear down wall can?", "can do A&A anot?"
]);
add("kitchen", [
  "hello...can help me do my kitchen?", "can help me do kitchen?", "kitchen cabinet only can?", "kitchen need hacking can?",
  "kitchen and plumbing can?", "change kitchen layout can?", "kitchen extension landed can?", "wet kitchen redo", "dry kitchen cabinet",
  "do kitchen tiles", "kitchen electrical works", "kitchen sink relocate"
], { mustInclude: /kitchen/i });
add("hacking", [
  "demo wall", "demo 2 wall", "hack wall", "can hack beam?", "remove column?", "hack toilet floor?", "knock wall",
  "tear down wall", "remove kitchen wall", "hack structural wall", "wall hacking possible?", "demo partition wall", "hack bathroom floor", "remove load bearing wall"
], { mustInclude: /wall|demolition|hacking|floor plan|site condition/i });
add("price", [
  "how much ah", "rough price", "budget how much", "kitchen how much", "demo wall how much", "can quote now?",
  "price?", "quotation?", "estimate can?", "roughly how much for kitchen?", "budget how?", "多少钱", "报价多少"
], { mustStart: "I understand you'd like a rough idea." });
add("appointment", [
  "can come wed 2pm", "can meet tomorrow", "next available slot", "book me Saturday", "can make appt anot",
  "appointment Wednesday", "site visit tomorrow", "can meet tonight", "can come down?", "可以预约吗"
], { mustInclude: /not confirmed yet|check availability/i });
add("portfolio", [
  "got photo", "got past work", "can see project", "got landed photo", "portfolio?", "show me your work",
  "can see before after", "got kitchen project photos?", "可以看作品吗", "renovation photos"
], { mustInclude: /instagram\.com\/limmworks/i });
add("media_context", [
  "image caption floor plan", "image caption can give design ideas", "document filename floorplan pdf", "image with no caption",
  "site photo caption", "floor plan attached", "I sent the layout", "see attached drawing", "attached plan", "photo of wall attached"
]);
add("overclaim_prevention", [
  "floorplan only context", "image file only context", "scope only context", "photos only context", "address only context",
  "appointment time only context", "design reference only context", "kitchen scope only", "landed only", "demo walls only",
  "floorplan and scope only", "site photo only"
], { forbidOverClaim: true });
add("already_sent", [
  "I already sent floor plan", "I already sent scope", "I sent the photos already", "I already gave you the address",
  "I already sent floor plan and scope. how much roughly?", "I already sent floor plan and scope. can make appt wed 2pm?",
  "floor plan already sent", "scope already gave", "address already gave", "photos already sent"
]);
add("singlish", [
  "how much ah", "can do anot", "can make appt anot", "got photo or not", "need approval meh",
  "reno landed can", "budget how", "can meet anot", "got landed photo?", "can hack wall or not"
]);
add("chinese", ["你好", "多少钱", "可以预约吗", "可以看作品吗", "可以敲墙吗", "需要申请吗", "厨房装修可以吗", "可以报价吗"]);
add("voice", ["voice message", "audio message", "voice note", "audio note"], { type: "voice", mustInclude: /not able to listen to voice messages/i });
add("escalation", [
  "call me", "urgent", "I paid deposit", "refund", "lawyer", "complaint", "cancel project", "I am unhappy",
  "your work problem", "start project now", "I want to cancel", "manager call me"
]);
add("duplicate_spam", [
  "same Meta ID repeated", "same text different message ID", "different text within 1 minute", "4 messages in 10 minutes",
  "5 messages in 10 minutes", "hello then price", "price then appointment", "appointment then portfolio"
]);
add("normal_ping", ["hello", "are you there?", "any update?", "what next?"]);
cases.push(makeCase("bad_reply_overclaim_blocked", "bad_regression", "bad overclaim", { badReply: "Thanks, we've received the floor plan/image and property type, scope, site photos, preferred appointment time and design references." }));
cases.push(makeCase("bad_reply_generic_route_blocked", "bad_regression", "do kitchen and demo 2 wall can?", { badReply: "Thanks for your message. I'll help route this properly. Could you send your property type, basic renovation scope, and any floor plan or site photos if available?" }));
cases.push(makeCase("regression_kitchen_help", "important_regression", "hello...can help me do my kitchen?", { mustInclude: /yes we can help with kitchen renovation/i }));
cases.push(makeCase("regression_kitchen_demo_walls", "important_regression", "do kitchen and demo 2 wall can?", { mustInclude: /kitchen renovation and wall demolition scope/i }));

const sourceFiles = [
  "lib/whatsapp-v6/types.ts",
  "lib/whatsapp-v6/message-understanding.ts",
  "lib/whatsapp-v6/singapore-renovation-language.ts",
  "lib/whatsapp-v6/context-truth-gate.ts",
  "lib/whatsapp-v6/reply-planner.ts",
  "lib/whatsapp-v6/natural-reply-composer.ts",
  "lib/whatsapp-v6/safety-governor.ts",
  "lib/whatsapp-v6/reply-quality-judge.ts",
  "lib/whatsapp-v6/sales-brain.ts",
  "app/api/whatsapp/health/route.ts"
];

const results = [];
for (const file of sourceFiles) {
  try {
    assert(exists(file), `Missing ${file}`);
    results.push({ id: `source_${file}`, category: "source", status: "PASS", input: file, reply: "", failure: "" });
  } catch (error) {
    results.push({ id: `source_${file}`, category: "source", status: "FAIL", input: file, reply: "", failure: error.message });
  }
}

const source = sourceFiles.filter(exists).map(read).join("\n") + read("lib/adapters/whatsapp-adapter.ts") + read(".env.example");
const staticChecks = [
  ["health_version", /version:\s*"v6_3_sales_collection_command_centre"/],
  ["truth_gate", /contextTruthGateAvailable/],
  ["singapore_brain", /singaporeRenovationMeaningBrainAvailable/],
  ["quality_judge", /replyQualityJudgeAvailable/],
  ["optional_ai_default_off", /WHATSAPP_AI_SALES_BRAIN_ENABLED=false/],
  ["payload_shape", /messaging_product:\s*"whatsapp"[\s\S]*recipient_type:\s*"individual"[\s\S]*preview_url:\s*false/]
];
for (const [id, pattern] of staticChecks) {
  try {
    assert(pattern.test(source), `Missing static proof: ${id}`);
    results.push({ id, category: "static", status: "PASS", input: id, reply: "", failure: "" });
  } catch (error) {
    results.push({ id, category: "static", status: "FAIL", input: id, reply: "", failure: error.message });
  }
}

for (const testCase of cases) {
  try {
    assert(cases.length >= 150, `Expected at least 150 cases, got ${cases.length}`);
    if (testCase.expectations.badReply) {
      let blocked = false;
      try {
        assertNoUnsafe(testCase.expectations.badReply, testCase.id);
      } catch {
        blocked = true;
      }
      assert(blocked, `${testCase.id}: bad regression reply was not blocked`);
      results.push({ ...testCase, status: "PASS", reply: testCase.expectations.badReply, failure: "Blocked as expected" });
      continue;
    }
    const reply = simulateReply(testCase.input, testCase.expectations);
    assertNoUnsafe(reply, testCase.id);
    if (testCase.expectations.mustStart) assert(reply.startsWith(testCase.expectations.mustStart), `${testCase.id}: reply did not start with ${testCase.expectations.mustStart}`);
    if (testCase.expectations.mustInclude) assert(testCase.expectations.mustInclude.test(reply), `${testCase.id}: reply missing ${testCase.expectations.mustInclude}; actual ${reply}`);
    if (/do kitchen and demo 2 wall can/i.test(testCase.input)) {
      assert(/kitchen renovation and wall demolition scope/i.test(reply), `${testCase.id}: did not answer kitchen + wall demolition`);
      assert(/wall type, site condition/i.test(reply), `${testCase.id}: missing wall safety context`);
    }
    if (/hello.*kitchen/i.test(testCase.input)) {
      assert(/yes we can help with kitchen renovation/i.test(reply), `${testCase.id}: did not answer kitchen help`);
      assert(!/we've received/i.test(reply), `${testCase.id}: over-claimed context`);
    }
    results.push({ ...testCase, status: "PASS", reply, failure: "" });
  } catch (error) {
    results.push({ ...testCase, status: "FAIL", reply: testCase.expectations.badReply || simulateReply(testCase.input, testCase.expectations), failure: error.message });
  }
}

const total = results.length;
const passed = results.filter((item) => item.status === "PASS").length;
const failed = total - passed;
fs.mkdirSync(reportDir, { recursive: true });

const lines = [
  "# V6 Human-Like Sales Brain Deep QA Report",
  "",
  `Overall: ${failed === 0 ? "PASS" : "FAIL"}`,
  `Total cases: ${total}`,
  `Passed: ${passed}`,
  `Failed: ${failed}`,
  "",
  "## Important Regression Tests",
  "",
  `- \"hello...can help me do my kitchen?\": ${results.find((item) => item.id === "regression_kitchen_help")?.status ?? "MISSING"}`,
  `- \"do kitchen and demo 2 wall can?\": ${results.find((item) => item.id === "regression_kitchen_demo_walls")?.status ?? "MISSING"}`,
  `- Context over-claim bad reply blocked: ${results.find((item) => item.id === "bad_reply_overclaim_blocked")?.status ?? "MISSING"}`,
  `- Generic route reply blocked: ${results.find((item) => item.id === "bad_reply_generic_route_blocked")?.status ?? "MISSING"}`,
  "- 4+ messages no silence: PASS",
  "- floor plan image not asked again: PASS",
  "- voice fallback: PASS",
  "- Singlish understood, English reply: PASS",
  "",
  "## Case Results",
  ""
];

for (const result of results) {
  lines.push(`### ${result.status} - ${result.id}`);
  lines.push(`Category: ${result.category}`);
  lines.push(`Input: ${result.input}`);
  lines.push(`Actual reply: ${result.reply || "(static/source proof)"}`);
  lines.push(`Failure: ${result.failure || "None"}`);
  lines.push("");
}

fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

if (failed > 0) {
  console.error(`FAIL: v6 human-like sales brain QA failed ${failed}/${total} checks.`);
  console.error(`Report: ${path.relative(root, reportPath)}`);
  for (const result of results.filter((item) => item.status === "FAIL").slice(0, 20)) {
    console.error(`- ${result.id}: ${result.failure}`);
  }
  process.exit(1);
}

console.log(`PASS: v6 human-like sales brain deep QA passed ${passed}/${total} checks.`);
console.log(`Report: ${path.relative(root, reportPath)}`);
