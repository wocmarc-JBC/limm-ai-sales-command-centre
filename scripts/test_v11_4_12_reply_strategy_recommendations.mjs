import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const engine = read("lib/reply-strategy-recommendations.ts");
const page = read("app/reply-strategy-recommendations/page.tsx");
const performancePage = read("app/reply-performance/page.tsx");
const repository = read("lib/data/reply-performance-repository.ts");
const gate = read(".github/workflows/release-gate.yml");

assert.match(engine, /REPLY_STRATEGY_MIN_REPLIES = 20/);
assert.match(engine, /REPLY_STRATEGY_MIN_RESPONSES = 8/);
assert.match(engine, /REPLY_STRATEGY_WARNING_MIN_REPLIES = 10/);
assert.match(engine, /REPLY_STRATEGY_WARNING_MIN_NEGATIVE = 3/);
assert.match(engine, /"risk_warning"/);
assert.match(engine, /"review_candidate"/);
assert.match(engine, /"monitor"/);
assert.match(engine, /"insufficient_evidence"/);
assert.match(engine, /automaticPromotionAllowed: false/);
assert.match(engine, /marcusApprovalRequired: true/);
assert.match(engine, /Collect more genuine production outcomes/);
assert.match(engine, /Live automatic promotion remains blocked/);
assert.match(engine, /frustrationRatePercent < 10 && correctionRatePercent < 10/);
assert.match(engine, /baselineProgressionPerReplyPercent/);
assert.doesNotMatch(engine, /sendWhatsApp|WhatsAppCloudApiAdapter|WHATSAPP_ACCESS_TOKEN|updateLead|insert\(/);

assert.match(page, /auth\.profile\.role !== "boss"/);
assert.match(page, /Marcus approval is required/);
assert.match(page, /includeQa/);
assert.match(page, /QA evidence is included\. Do not use this view for production strategy decisions/);
assert.match(page, /Recommendations are review prompts, not live strategy changes/);
assert.match(page, /No recommendation changes the live reply brain/);
assert.match(page, /buildReplyStrategyRecommendations/);
assert.match(performancePage, /href="\/reply-strategy-recommendations"/);
assert.match(repository, /input\.includeQa \|\| !lead\.isTest/);
assert.match(gate, /Verify v11\.4\.12 reply strategy recommendations/);

const primaryLinkCount = (read("components/ShellChrome.tsx").match(/href: "\/reply-performance", label: "Reply Performance"/g) ?? []).length;
assert.equal(primaryLinkCount, 1);

console.log("PASS v11.4.12 conservative evidence thresholds, boss-only review, QA exclusion, no automatic promotion, and no-send boundary");
