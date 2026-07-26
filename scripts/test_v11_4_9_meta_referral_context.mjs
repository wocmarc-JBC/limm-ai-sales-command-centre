import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const parser = read("lib/whatsapp-parser.ts");
const referral = read("lib/whatsapp-referral-context.ts");
const autoReply = read("lib/whatsapp-auto-reply.ts");
const leads = read("lib/data/leads-repository.ts");
const brain = read("lib/whatsapp-v9-sales-brain.ts");
const gate = read(".github/workflows/release-gate.yml");

assert.match(parser, /referral:\s*WhatsAppReferralContext \| null/);
assert.match(parser, /parseWhatsAppReferralContext\(message\?\.referral\)/);
assert.match(referral, /ctwa_clid/);
assert.match(referral, /source_url/);
assert.match(referral, /inferred_from_confirmed_ad_copy/);
assert.match(referral, /landed A&A and renovation works/);
assert.match(referral, /commercial renovation and fit-out works/);
assert.match(referral, /hacking and demolition works/);
assert.match(referral, /composeReferralAwareFirstTouchReply/);
assert.match(referral, /metaReferralRawIdentifiersClientFacing:\s*false/);
assert.match(autoReply, /whatsappReferral:/);
assert.match(autoReply, /persistWhatsAppReferralContext/);
assert.match(autoReply, /whatsapp_meta_referral_context_captured/);
assert.match(leads, /whatsappReferralContext/);
assert.match(leads, /Meta Click-to-WhatsApp/);
assert.match(brain, /getWhatsAppReferralContext/);
assert.match(brain, /composeReferralAwareFirstTouchReply/);
assert.match(brain, /referralTrace/);
assert.match(gate, /Verify v11\.4\.9 Meta referral context/);
assert.doesNotMatch(referral, /WHATSAPP_ACCESS_TOKEN|sendWhatsApp|WhatsAppCloudApiAdapter/);
assert.doesNotMatch(referral, /sourceId\}.*reply|ctwaClid\}.*reply|sourceUrl\}.*reply/);

const primaryLinkCount = (read("components/ShellChrome.tsx").match(/href: "\/reply-performance", label: "Reply Performance"/g) ?? []).length;
assert.equal(primaryLinkCount, 1);

console.log("PASS v11.4.9 confirmed Meta referral context, durable memory, client-safe first-touch replies, and no-send boundary");
