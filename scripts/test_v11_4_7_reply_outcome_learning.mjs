import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const classifier = read("lib/whatsapp-reply-outcome.ts");
const repository = read("lib/data/ai-reply-outcome-repository.ts");
const worker = read("lib/ai-reply-outcome-worker.ts");
const route = read("app/api/operations/reply-outcome-learning/route.ts");
const qualityGate = read("lib/whatsapp-reply-quality-gate.ts");
const vercel = read("vercel.json");

assert.match(classifier, /evaluateReplyOutcomeFromInbound/);
for (const marker of [
  "files_received",
  "appointment_interest",
  "quotation_interest",
  "project_details_provided",
  "frustration_or_correction",
  "human_requested",
  "client_engaged"
]) assert.match(classifier, new RegExp(marker));
assert.match(classifier, /responseLatencySeconds/);
assert.match(classifier, /positiveProgression/);

assert.match(repository, /outcome_already_recorded/);
assert.match(repository, /outcomeRecordedAt/);
assert.match(repository, /outcomeVersion: "v11\.4\.7"/);
assert.match(repository, /shadow_candidate/);
assert.match(repository, /quality_observation_message_mismatch/);

assert.match(worker, /processAiReplyOutcomes/);
assert.match(worker, /ai_reply_quality_events/);
assert.match(worker, /lead_messages/);
assert.match(worker, /recordAiReplyOutcome/);
assert.match(route, /authorizeReliabilityScheduler/);
assert.match(route, /clientMessagesSent: 0/);
assert.match(vercel, /reply-outcome-learning/);

assert.match(qualityGate, /repeated_price_question_escalation/);
assert.match(qualityGate, /repeated_price_question_handoff/);
assert.match(qualityGate, /repeatedQuestionCount/);
assert.match(qualityGate, /I will not repeat the same questions/);
assert.match(qualityGate, /stop the intake questions and route the conversation/);

assert.doesNotMatch(`${classifier}\n${repository}\n${worker}\n${route}`, /sendReply\(|WhatsAppCloudApiAdapter|WHATSAPP_ACCESS_TOKEN|graph\.facebook\.com/);
console.log("PASS v11.4.7 reply outcome learning, repeated-question escalation, idempotent persistence, scheduled analysis, and no-send safety");
