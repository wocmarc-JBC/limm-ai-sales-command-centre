import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const referral = read("lib/whatsapp-referral-context.ts");
const ingestion = read("lib/whatsapp-referral-ingestion.ts");
const repository = read("lib/data/whatsapp-referral-context-repository.ts");
const worker = read("lib/whatsapp-inbound-worker.ts");
const route = read("app/api/whatsapp/webhook/route.ts");
const qualityGate = read("lib/whatsapp-reply-quality-gate.ts");
const releaseGate = read(".github/workflows/release-gate.yml");

assert.match(referral, /ctwa_clid/);
assert.match(referral, /source_url/);
assert.match(referral, /inferred_from_confirmed_ad_copy/);
assert.match(referral, /landed A&A and renovation works/);
assert.match(referral, /commercial renovation and fit-out works/);
assert.match(referral, /hacking and demolition works/);
assert.match(referral, /composeReferralAwareFirstTouchReply/);
assert.match(referral, /metaReferralRawIdentifiersClientFacing:\s*false/);
assert.match(ingestion, /parseWhatsAppInboundWithReferral/);
assert.match(ingestion, /parseWhatsAppReferralContext\(message\.referral\)/);
assert.match(ingestion, /Confirmed Meta ad context:/);
assert.match(ingestion, /Preserve the client's original text/);
assert.match(route, /parseWhatsAppInboundWithReferral\(payload\)/);
assert.match(route, /confirmedReferralCount/);
assert.match(repository, /whatsappReferralContext/);
assert.match(repository, /whatsapp_meta_referral_context_captured/);
assert.match(repository, /rawIdentifiersClientFacing:\s*false/);
assert.match(repository, /noWhatsAppSend:\s*true/);
assert.match(worker, /prepareReferralContext/);
assert.match(worker, /persistWhatsAppReferralContext/);
assert.match(worker, /failed_non_blocking/);
assert.match(worker, /duplicate-send risk/);
assert.match(qualityGate, /getWhatsAppReferralContext/);
assert.match(qualityGate, /composeReferralAwareFirstTouchReply/);
assert.match(qualityGate, /confirmed_meta_referral_first_touch/);
assert.match(qualityGate, /!hasPreviousWhatsAppReply/);
assert.match(releaseGate, /Verify v11\.4\.9 Meta referral context/);
assert.doesNotMatch(`${referral}\n${ingestion}\n${repository}\n${qualityGate}`, /WHATSAPP_ACCESS_TOKEN|sendWhatsApp|WhatsAppCloudApiAdapter/);
assert.doesNotMatch(referral, /sourceId\}.*reply|ctwaClid\}.*reply|sourceUrl\}.*reply/);

const primaryLinkCount = (read("components/ShellChrome.tsx").match(/href: "\/reply-performance", label: "Reply Performance"/g) ?? []).length;
assert.equal(primaryLinkCount, 1);

console.log("PASS v11.4.9 confirmed Meta referral context, durable memory, client-safe first-touch replies, and non-blocking no-send boundary");
