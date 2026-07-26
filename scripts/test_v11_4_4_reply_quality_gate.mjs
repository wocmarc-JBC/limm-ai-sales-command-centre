import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const gate = read("lib/whatsapp-reply-quality-gate.ts");
const decision = read("lib/whatsapp-reply-decision.ts");

assert.match(gate, /improveWhatsAppReplyQuality/);
assert.match(gate, /frustration_stop_and_handoff/);
assert.match(gate, /answer_first_override/);
assert.match(gate, /knownFloorPlan/);
assert.match(gate, /knownSitePhotos/);
assert.match(gate, /capQuestions/);
assert.match(gate, /questionCount/);
assert.match(gate, /laminated wall cladding/);
assert.match(gate, /We can assess the wall hacking/);
assert.match(gate, /Three months may be possible/);
assert.match(gate, /We already have the files you sent/);
assert.match(gate, /stopped the intake questions/);

assert.match(decision, /whatsapp-reply-quality-gate/);
assert.match(decision, /improveWhatsAppReplyQuality/);
assert.match(decision, /replyQualityGate/);
assert.match(decision, /v9\.handoffRequired \|\| replyQuality\.handoffRequired/);
assert.match(decision, /replyQuality\.answeredDirectQuestion/);
assert.match(decision, /replyQuality\.askedNextBestQuestion/);

console.log("PASS v11.4.4 answer-first replies, file-memory enforcement, one-question budget, frustration handoff, and quality tracing");
