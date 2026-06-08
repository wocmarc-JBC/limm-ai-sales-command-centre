import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const requireNative = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moduleCache = new Map();

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeText(text) {
  return String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function stripMarkdownMailto(text) {
  return String(text ?? "").replace(/\[([^\]]+)\]\(mailto:[^)]+\)/gi, "$1");
}

function resolveProjectModule(specifier, parentDir = ROOT) {
  if (specifier === "server-only") return { virtual: true, value: {} };
  if (specifier.startsWith("@/")) return resolveExisting(path.join(ROOT, specifier.slice(2)));
  if (specifier.startsWith("./") || specifier.startsWith("../")) return resolveExisting(path.resolve(parentDir, specifier));
  if (specifier.includes("/") && fs.existsSync(path.join(ROOT, specifier))) return resolveExisting(path.join(ROOT, specifier));
  return { external: true, specifier };
}

function resolveExisting(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    `${basePath}.json`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return { filePath: candidate };
  }
  return { external: true, specifier: basePath };
}

function loadProjectModule(specifier, parentDir = ROOT) {
  const resolved = resolveProjectModule(specifier, parentDir);
  if (resolved.virtual) return resolved.value;
  if (resolved.external) return requireNative(resolved.specifier);
  const filePath = resolved.filePath;
  if (moduleCache.has(filePath)) return moduleCache.get(filePath).exports;
  if (filePath.endsWith(".json")) return readJson(filePath);

  const ts = requireNative("typescript");
  const source = fs.readFileSync(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX
    },
    fileName: filePath
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(filePath, module);
  const localRequire = (childSpecifier) => loadProjectModule(childSpecifier, path.dirname(filePath));
  const wrapped = new Function("exports", "require", "module", "__filename", "__dirname", output);
  wrapped(module.exports, localRequire, module, filePath, path.dirname(filePath));
  return module.exports;
}

const { buildWhatsAppReplyDecision } = loadProjectModule("lib/whatsapp-reply-decision.ts");

function baseLead(caseItem) {
  const memory = caseItem.memory_before ?? {};
  const now = new Date("2026-06-08T09:00:00+08:00").toISOString();
  return {
    id: `replay-${caseItem.id}`,
    clientName: memory.client_name ?? "Replay Client",
    phone: memory.phone ?? "6599999999",
    email: "",
    source: "WhatsApp",
    division: "LIMM Works",
    propertyType: memory.property_type ?? "",
    serviceType: memory.service_type ?? "",
    scopeSummary: memory.scope_summary ?? "",
    leadScore: memory.lead_score ?? 70,
    leadCategory: memory.lead_category ?? "Warm",
    status: memory.status ?? "New Enquiry",
    missingInfo: [],
    aiRecommendedNextAction: "",
    bossApprovalNeeded: Boolean(memory.handoff_required),
    appointmentSuitable: false,
    appointmentType: "initial_project_review",
    appointmentReadiness: 0,
    quotationReadiness: 0,
    lastClientMessage: caseItem.client_message,
    lastReplyAt: null,
    createdAt: now,
    updatedAt: now,
    preferredContactTime: memory.preferred_meeting_time ?? "",
    riskFlags: [],
    projectAddress: memory.address ?? "",
    propertyArea: memory.area ?? "",
    postalCode: memory.postal_code ?? "",
    intakeProfile: {
      budgetExpectation: memory.budget_expectation ?? "",
      timeline: memory.timeline ?? "",
      keyCollectionDate: memory.key_collection_date ?? "",
      moveInDate: memory.move_in_date ?? "",
      preferredMeetingTiming: memory.preferred_meeting_time ?? "",
      propertyType: memory.property_type ?? "",
      propertyAreaOrAddress: memory.address ?? memory.area ?? "",
      scopeOfWork: memory.scope_summary ?? "",
      floorPlanStatus: memory.floor_plan_received ? "received" : "",
      sitePhotosStatus: memory.site_photos_received ? "received" : "",
      trace: memory.trace ?? {}
    }
  };
}

function makeMessage(caseId, index, direction, body, metadata = {}) {
  return {
    id: `${caseId}-msg-${index}`,
    leadId: `replay-${caseId}`,
    direction,
    channel: "whatsapp",
    body,
    safeToSend: direction !== "outbound",
    providerMessageId: `${caseId}-${index}`,
    providerTimestamp: null,
    whatsappStatus: direction === "outbound" ? "sent" : "received",
    metadata,
    createdAt: new Date(Date.UTC(2026, 5, 8, 1, index, 0)).toISOString()
  };
}

function memoryMessages(caseItem) {
  const memory = caseItem.memory_before ?? {};
  const messages = [];
  let index = 1;
  const addInbound = (body, metadata = {}) => messages.push(makeMessage(caseItem.id, index++, "inbound", body, metadata));
  const addOutbound = (body) => messages.push(makeMessage(caseItem.id, index++, "outbound", body, {}));

  if (memory.previous_inbound) for (const body of memory.previous_inbound) addInbound(body);
  if (memory.property_type || memory.scope_summary || memory.address || memory.budget_expectation || memory.timeline || memory.key_collection_date) {
    addInbound([
      memory.property_type,
      memory.scope_summary,
      memory.address,
      memory.budget_expectation ? `budget ${memory.budget_expectation}` : "",
      memory.timeline,
      memory.key_collection_date
    ].filter(Boolean).join(", "));
  }
  if (memory.floor_plan_received) addInbound("floor plan attached", { messageType: "document", filename: "floorplan.pdf", mimeType: "application/pdf" });
  if (memory.floor_plan_image_received) addInbound("can give me design ideas?", { messageType: "image", filename: "floorplan.jpg", mimeType: "image/jpeg", caption: "can give me design ideas?" });
  if (memory.site_photos_received) addInbound("site photos attached", { messageType: "image", filename: "site-photo.jpg", mimeType: "image/jpeg" });
  if (memory.design_references_received) addInbound("design reference images attached", { messageType: "image", filename: "design-reference.jpg", mimeType: "image/jpeg" });
  if (memory.preferred_meeting_time) addInbound(`preferred meeting ${memory.preferred_meeting_time}`);
  if (memory.previous_outbound) for (const body of memory.previous_outbound) addOutbound(body);
  return messages;
}

function questionCount(reply) {
  return (reply.match(/\?/g) ?? []).length;
}

function valueAt(object, dottedPath) {
  return dottedPath.split(".").reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), object);
}

function intentMatches(decision, expected) {
  const trace = decision.blackBoxTrace ?? {};
  const candidates = [
    decision.intent,
    decision.salesMove,
    trace.primaryIntent,
    trace.v7_primaryIntent,
    trace.detected_intent,
    ...(Array.isArray(trace.detectedIntents) ? trace.detectedIntents : []),
    ...(Array.isArray(trace.v7_detectedIntents) ? trace.v7_detectedIntents : [])
  ].map(String);
  return candidates.includes(expected);
}

function salesMoveMatches(decision, expected) {
  const trace = decision.blackBoxTrace ?? {};
  const candidates = [
    decision.salesMove,
    trace.primarySalesMove,
    trace.primaryMove,
    trace.v7_salesMove
  ].map(String);
  return candidates.includes(expected);
}

function hasForbiddenPriceWording(reply) {
  const text = stripMarkdownMailto(reply);
  return /(?:\bfrom\s+\$|\baround\s+\$|\busually\s+around\s+\$|\bprice\s+range\b|\bquote\s+range\b|\bpackage\s+price\b|\brough\s+estimate\b|\bs\$\s*\d|\$\s*\d)/i.test(text);
}

const requiredTraceFields = [
  "replyEngine",
  "plannerVersion",
  "primaryIntent",
  "primarySalesMove",
  "templateId",
  "memoryUsed",
  "knownFactsUsed",
  "missingFactsSelected",
  "handoffRequired",
  "blockedLegacyTemplate",
  "safetyValidatorPassed",
  "finalReplyHash"
];

function compactTrace(trace) {
  const source = trace ?? {};
  const normalizedContext = source.v7_normalizedContext ?? {};
  return {
    replyEngine: source.replyEngine,
    plannerVersion: source.plannerVersion,
    primaryIntent: source.primaryIntent,
    primarySalesMove: source.primarySalesMove,
    templateId: source.templateId,
    memoryUsed: source.memoryUsed,
    knownFactsUsed: source.knownFactsUsed,
    missingFactsSelected: source.missingFactsSelected,
    handoffRequired: source.handoffRequired,
    blockedLegacyTemplate: source.blockedLegacyTemplate,
    safetyValidatorPassed: source.safetyValidatorPassed,
    finalReplyHash: source.finalReplyHash,
    v7_primaryIntent: source.v7_primaryIntent,
    v7_salesMove: source.v7_salesMove,
    v7_detectedIntents: source.v7_detectedIntents,
    v7_stage: source.v7_stage,
    v7_askedFields: source.v7_askedFields,
    v7_normalizedContext: {
      property_type: normalizedContext.property_type,
      property_address: normalizedContext.property_address,
      scope_summary: normalizedContext.scope_summary,
      floor_plan_received: normalizedContext.floor_plan_received,
      site_photos_received: normalizedContext.site_photos_received,
      reference_images_received: normalizedContext.reference_images_received,
      budget_expectation: normalizedContext.budget_expectation ? "received" : "",
      timeline: normalizedContext.timeline ? "received" : "",
      known_facts_summary: normalizedContext.known_facts_summary
    }
  };
}

function validateCase(caseItem) {
  const lead = baseLead(caseItem);
  const previousMessages = memoryMessages(caseItem);
  const decision = buildWhatsAppReplyDecision({
    inboundMessageText: caseItem.client_message,
    inboundMessageType: caseItem.message_type ?? "text",
    lead,
    previousMessages,
    autoReplyEnabled: true,
    openAiEnabled: false,
    calendarEventId: caseItem.calendar_event_id ?? "",
    providerMessageId: `replay-${caseItem.id}`
  });

  const reply = decision.replyText ?? "";
  const normalizedReply = normalizeText(reply);
  const failures = [];
  const includes = caseItem.expected_reply_must_include ?? [];
  const mustNot = [...(caseItem.expected_reply_must_not_include ?? []), ...(caseItem.forbidden_phrases ?? [])];

  if (!decision.shouldReply) failures.push("should_reply_false");
  if (!reply.trim()) failures.push("empty_reply");
  if (!intentMatches(decision, caseItem.expected_intent)) failures.push(`intent_mismatch:${caseItem.expected_intent}`);
  if (!salesMoveMatches(decision, caseItem.expected_sales_move)) failures.push(`sales_move_mismatch:${caseItem.expected_sales_move}`);
  for (const phrase of includes) {
    if (phrase && !normalizedReply.includes(normalizeText(phrase))) failures.push(`missing_phrase:${phrase}`);
  }
  for (const phrase of mustNot) {
    if (phrase && normalizedReply.includes(normalizeText(phrase))) failures.push(`forbidden_phrase:${phrase}`);
  }
  if (caseItem.no_price_language !== false && hasForbiddenPriceWording(reply)) failures.push("forbidden_price_language");
  if (questionCount(reply) > caseItem.max_questions_allowed) failures.push(`too_many_questions:${questionCount(reply)}`);
  if (Boolean(decision.handoffRequired) !== Boolean(caseItem.handoff_required)) failures.push(`handoff_mismatch:${decision.handoffRequired}`);
  for (const field of requiredTraceFields) {
    if (!(field in (decision.blackBoxTrace ?? {}))) failures.push(`missing_trace:${field}`);
  }
  for (const [field, expected] of Object.entries(caseItem.expected_memory_after ?? {})) {
    const actual = valueAt(decision.blackBoxTrace, `v7_normalizedContext.${field}`);
    if (actual !== expected) failures.push(`memory_after_mismatch:${field}`);
  }
  if (caseItem.memory_before?.serious_landed_aa && /\bscope of work|main areas|areas involved\b/i.test(reply)) failures.push("serious_landed_aa_broad_scope_ask");
  if ((caseItem.memory_before?.floor_plan_received || caseItem.memory_before?.floor_plan_image_received) && /\bsend (?:the |your )?floor plan|share (?:the |your )?floor plan/i.test(reply)) failures.push("asked_received_floor_plan_again");

  return {
    id: caseItem.id,
    category: caseItem.category,
    conversation_id: caseItem.conversation_id,
    turn_index: caseItem.turn_index,
    passed: failures.length === 0,
    failures,
    client_message: caseItem.client_message,
    reply,
    expected_intent: caseItem.expected_intent,
    expected_sales_move: caseItem.expected_sales_move,
    trace: compactTrace(decision.blackBoxTrace)
  };
}

function reportPaths(packPath, count) {
  const name = path.basename(packPath);
  if (name.includes("golden_100")) {
    return {
      json: path.join(ROOT, "reports", "replay_golden_100_report.json"),
      md: path.join(ROOT, "reports", "replay_golden_100_report.md")
    };
  }
  const match = name.match(/_(\d+)\.json$/);
  const label = match?.[1] ?? String(count);
  return {
    json: path.join(ROOT, "reports", `replay_${label}_report.json`),
    md: path.join(ROOT, "reports", `replay_${label}_report.md`)
  };
}

function writeMarkdownReport(filePath, summary, results) {
  const failed = results.filter((item) => !item.passed);
  const lines = [
    "# LIMM WhatsApp Replay Report",
    "",
    `Status: ${summary.passed ? "PASS" : "FAIL"}`,
    `Pack: ${summary.pack}`,
    `Total: ${summary.total}`,
    `Passed: ${summary.passedCount}`,
    `Failed: ${summary.failedCount}`,
    "",
    "## Failed Cases",
    ""
  ];
  if (!failed.length) lines.push("None.");
  for (const item of failed.slice(0, 80)) {
    lines.push(`- ${item.id}: ${item.failures.join(", ")}`);
    lines.push(`  - Client: ${item.client_message}`);
    lines.push(`  - Reply: ${item.reply}`);
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

const packPath = path.resolve(ROOT, argValue("--pack", "tests/replay/limm_replay_golden_100.json"));
const pack = readJson(packPath);
const cases = pack.cases ?? [];
if (!Array.isArray(cases) || !cases.length) {
  console.error("Replay pack has no cases.");
  process.exit(1);
}

const results = cases.map(validateCase);
const failed = results.filter((item) => !item.passed);
const summary = {
  pack: path.relative(ROOT, packPath),
  version: pack.version ?? "",
  total: results.length,
  passedCount: results.length - failed.length,
  failedCount: failed.length,
  score: Number((((results.length - failed.length) / results.length) * 100).toFixed(2)),
  passed: failed.length === 0,
  generatedAt: new Date().toISOString()
};

fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
const paths = reportPaths(packPath, results.length);
fs.writeFileSync(paths.json, JSON.stringify({ summary, results }, null, 2));
writeMarkdownReport(paths.md, summary, results);

console.log(`LIMM replay runner: ${summary.passed ? "PASS" : "FAIL"} ${summary.passedCount}/${summary.total} (${summary.score}%)`);
console.log(`Report: ${path.relative(ROOT, paths.json)}`);
if (failed.length) {
  for (const item of failed.slice(0, 20)) {
    console.error(`FAIL ${item.id}: ${item.failures.join(", ")}`);
    console.error(`  reply: ${item.reply}`);
  }
  process.exit(1);
}
