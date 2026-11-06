import assert from "node:assert/strict";
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
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: filename
  }).outputText;
  module._compile(output, filename);
};

const { buildV9WhatsAppSalesBrainDecision } = require(path.join(ROOT, "lib/whatsapp-v9-sales-brain.ts"));
const { improveWhatsAppReplyQuality } = require(path.join(ROOT, "lib/whatsapp-reply-quality-gate.ts"));
const { classifyWhatsAppHandoffTier } = require(path.join(ROOT, "lib/whatsapp-handoff-tier.ts"));
const { evaluateWhatsAppReplyQuality } = require(path.join(ROOT, "lib/ai-quality.ts"));
const { validateWhatsAppAutoReply } = require(path.join(ROOT, "lib/whatsapp-safety.ts"));

function lead(overrides = {}) {
  return {
    id: "lead-v12",
    clientName: "Client",
    phone: "6590000000",
    source: "whatsapp",
    division: "LIMM Works",
    propertyType: "condo",
    serviceType: "renovation",
    scopeSummary: "kitchen renovation",
    leadScore: 30,
    leadCategory: "Warm",
    status: "New",
    missingInfo: [],
    aiRecommendedNextAction: "",
    bossApprovalNeeded: false,
    appointmentReadiness: 0,
    quotationReadiness: 0,
    lastClientMessage: "",
    lastReplyAt: null,
    createdAt: "2026-11-06T00:00:00.000Z",
    preferredContactTime: "",
    riskFlags: [],
    botPaused: false,
    needsMarcus: false,
    salesStage: "New Lead",
    intakeProfile: {
      propertyType: "condo",
      scopeOfWork: "kitchen renovation"
    },
    ...overrides
  };
}

function inbound(body, metadata = {}) {
  return {
    id: `msg-${Math.random().toString(16).slice(2)}`,
    leadId: "lead-v12",
    direction: "inbound",
    channel: "whatsapp",
    body,
    safeToSend: true,
    providerMessageId: `wamid.${Math.random().toString(16).slice(2)}`,
    providerTimestamp: "2026-11-06T00:00:00.000Z",
    whatsappStatus: "received",
    metadata: { messageType: "text", ...metadata },
    createdAt: "2026-11-06T00:00:00.000Z"
  };
}

function decide(text, currentLead = lead(), previousMessages = [inbound(text)]) {
  return buildV9WhatsAppSalesBrainDecision({
    inboundMessageText: text,
    inboundMessageType: "text",
    lead: currentLead,
    previousMessages,
    autoReplyEnabled: true,
    calendarEventId: "",
    providerMessageId: "wamid.v12"
  });
}

function assertOneQuestionOrLess(reply) {
  assert.ok((reply.match(/\?/g) ?? []).length <= 1, reply);
}

const call = decide("Can you call me to discuss this?");
assert.equal(call.intent, "call_request");
assert.equal(call.salesMove, "call_or_chat_handoff");
assert.equal(call.handoffRequired, true);
assert.match(call.replyText, /Marcus/i);
assertOneQuestionOrLess(call.replyText);

const quoteLead = lead({
  intakeProfile: {
    propertyType: "condo",
    scopeOfWork: "kitchen renovation",
    floorPlanStatus: "received"
  }
});
const quote = decide("Can you send me a quotation?", quoteLead);
assert.equal(quote.intent, "quotation_request");
assert.equal(quote.salesMove, "quotation_review_handoff");
assert.equal(quote.handoffRequired, true);
assert.match(quote.replyText, /quotation review/i);
assert.doesNotMatch(quote.replyText, /don't want to guess|do not want to guess/i);
assertOneQuestionOrLess(quote.replyText);

const siteVisit = decide("Can someone come down for a site visit?");
assert.equal(siteVisit.intent, "site_visit_request");
assert.equal(siteVisit.salesMove, "site_visit_handoff");
assert.equal(siteVisit.handoffRequired, true);
assert.match(siteVisit.replyText, /site review/i);
assertOneQuestionOrLess(siteVisit.replyText);

const appointment = decide("Can we meet Wednesday 2pm?");
assert.equal(appointment.intent, "appointment_request");
assert.equal(appointment.handoffRequired, true);
assert.match(appointment.replyText, /Wednesday 2PM|2PM/i);
assert.doesNotMatch(appointment.replyText, /appointment (?:is )?confirmed|booked/i);

const defectsInspection = decide("How much for a defects inspection with report and photos?");
assert.equal(defectsInspection.intent, "unsupported_service_question");
assert.match(defectsInspection.replyText, /don't provide standalone defects-inspection reports/i);
assert.doesNotMatch(defectsInspection.replyText, /property type|main areas|don't want to guess/i);

const simpleAcknowledgement = decide("ok");
assert.equal(simpleAcknowledgement.intent, "simple_acknowledgement");
assert.doesNotMatch(simpleAcknowledgement.replyText, /don't want to guess|main scope|which areas/i);
assertOneQuestionOrLess(simpleAcknowledgement.replyText);

const walkUp = decide("This is a walk-up apartment, full renovation ASAP");
assert.equal(walkUp.trace.v9Memory.property_type, "walk-up apartment");
assert.equal(walkUp.trace.v9Memory.timeline_expectation, "ASAP");
assert.doesNotMatch(walkUp.replyText, /condo noted|your condo/i);

const landed = decide(
  "2 storey landed A&A at 47 Kasai Road, budget 500k, key collection next month",
  lead({ propertyType: "", serviceType: "", scopeSummary: "", intakeProfile: {} })
);
assert.equal(landed.trace.majorLandedAa, true);
assert.equal(landed.handoffRequired, true);
assert.doesNotMatch(landed.replyText, /which areas|main areas/i);
assert.match(landed.replyText, /Marcus|initial project review/i);

const qualityPreservesSalesReply = improveWhatsAppReplyQuality({
  candidateReply: quote.replyText,
  inboundMessageText: "Can you send me a quotation?",
  intent: quote.intent,
  lead: quoteLead,
  previousMessages: [inbound("Can you send me a quotation?")]
});
assert.equal(qualityPreservesSalesReply.replyText, quote.replyText);
assert.equal(qualityPreservesSalesReply.handoffRequired, true);

const tier = classifyWhatsAppHandoffTier({
  lead: quoteLead,
  latestMessage: "Can you send me a quotation?",
  recentMessages: [inbound("Can you send me a quotation?")],
  decision: {
    ...quote,
    blackBoxTrace: quote.trace,
    conversationIntent: "genuine_new_renovation_lead"
  }
});
assert.equal(tier.tier, "pause_and_escalate");
assert.equal(tier.pauseRequired, true);
assert.equal(tier.botContinues, false);
assert.ok(tier.reasons.some((reason) => /quotation/i.test(reason)));

const genericDeflection = evaluateWhatsAppReplyQuality(
  "I don't want to guess on that specific point. The team can review and advise the next step.",
  {
    context: {
      directQuestion: true,
      answeredDirectQuestion: false,
      salesReady: true,
      handoffRequired: false
    }
  }
);
assert.equal(genericDeflection.releaseEligible, false);
assert.ok(genericDeflection.flags.includes("generic_deflection"));
assert.ok(genericDeflection.flags.includes("sales_ready_without_handoff"));

const leakedFilename = "Received whatsapp_image_wamid.ABCDEF1234567890abcdef123456.jpg";
const privacySafety = validateWhatsAppAutoReply(leakedFilename);
assert.equal(privacySafety.ok, false);
assert.ok(privacySafety.errorCodes.includes("internal_identifier_or_filename"));
const privacyQuality = evaluateWhatsAppReplyQuality(leakedFilename);
assert.equal(privacyQuality.safety, 0);
assert.equal(privacyQuality.releaseEligible, false);

const handoffControl = fs.readFileSync(path.join(ROOT, "lib/data/whatsapp-handoff-control-repository.ts"), "utf8");
for (const witness of [
  "beginVerifiedCompletion",
  "observeVerifiedCompletion",
  "readControl",
  "needs_marcus",
  "bot_paused",
  "sales_stage",
  "sales_next_action",
  "completionStatus !== \"verified\""
]) {
  assert.match(handoffControl, new RegExp(witness));
}

console.log("PASS v12 sales-ready detection, intent-specific replies, Marcus escalation, bot pause policy, CRM progression, completion read-back, evaluator truth, and filename privacy");
