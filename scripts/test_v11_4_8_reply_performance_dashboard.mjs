import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/reply-performance/page.tsx");
const repository = read("lib/data/reply-performance-repository.ts");
const revenue = read("app/revenue-intelligence/page.tsx");

assert.match(page, /Reply Performance/);
assert.match(page, /Actual client outcomes after AI replies/);
assert.match(page, /Client response rate/);
assert.match(page, /Positive progression/);
assert.match(page, /Files received/);
assert.match(page, /Appointment interest/);
assert.match(page, /Quotation interest/);
assert.match(page, /Frustration rate/);
assert.match(page, /Human correction/);
assert.match(page, /includeQa/);
assert.match(page, /auth\.profile\.role === "boss"/);
assert.match(page, /small samples/i);
assert.match(repository, /ai_reply_quality_events/);
assert.match(repository, /shadow_candidate/);
assert.match(repository, /outcomeRecordedAt/);
assert.match(repository, /positiveProgression/);
assert.match(repository, /responseLatencySeconds/);
assert.match(repository, /includeTest: true/);
assert.match(repository, /input\.includeQa \|\| !lead\.isTest/);
assert.match(revenue, /href="\/reply-performance"/);
assert.doesNotMatch(`${page}\n${repository}`, /sendReply|sendWhatsApp|WhatsAppCloudApiAdapter|WHATSAPP_ACCESS_TOKEN/);

console.log("PASS v11.4.8 protected reply performance and sales learning dashboard");
