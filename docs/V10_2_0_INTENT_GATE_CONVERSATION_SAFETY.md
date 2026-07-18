# v10.2.0 — Intent Gate & Conversation Safety

## Release outcome

v10.2.0 classifies every saved WhatsApp inbound conversation before renovation lead-fact extraction or the single v9 sales composer runs. Non-sales contacts remain visible in the WhatsApp operator inbox, but are excluded from sales queues, scoring, reporting, follow-ups, Mission Map, Command Core Sales, and quotation readiness.

No Meta payload, pricing, calendar, voice-transcription, authentication, secret, or competing reply-composer path was added.

## Live pipeline

1. Receive inbound message through the existing webhook.
2. Save the raw message and provider message ID.
3. Normalize at most the latest 10 meaningful WhatsApp messages.
4. Classify conversation intent with deterministic v10.2 rules.
5. Determine sales eligibility and persist the route.
6. Extract renovation facts only when `lead_eligible=true`.
7. Identify the latest unanswered client question.
8. Plan either one relevant reply or an intentional no-reply.
9. Use the existing v9 composer only for eligible renovation leads.
10. Apply existing knowledge, brand, and safety rules.
11. Compare the candidate with the latest five AI replies; block similarity at or above `0.85`.
12. Apply the final human-takeover guard, including a fresh bot-pause read immediately before send.
13. Send through the unchanged WhatsApp Cloud API adapter or suppress.

## Intent taxonomy and policy

| Intent | Route | Sales eligible | Default auto-reply policy |
|---|---|---:|---|
| `genuine_new_renovation_lead` | `sales_lead` | Yes | Existing v9 sales brain |
| `existing_client_project_message` | `existing_client` | No | One project-team acknowledgement |
| `vendor_supplier_solicitation` | `vendor_inbox` | No | One vendor acknowledgement |
| `partnership_collaboration_outreach` | `partnership_review` | No | One collaboration acknowledgement |
| `recruitment_job_enquiry` | `recruitment_review` | No | One recruitment acknowledgement |
| `spam_scam_irrelevant` | `spam_suppressed` | No | No auto-reply |
| `wrong_number_or_general_chat` | `general_enquiry` | No | One neutral clarification; explicit opt-outs get no reply |
| `unclear_intent` | `intent_review` | No | One neutral clarification |
| `human_takeover_or_bot_paused` | `human_takeover` | No | No auto-reply |
| `existing_vendor_or_business_contact` | `business_contact` | No | No auto-reply |

Classifier failure is fail-closed: it records `unclear_intent`, confidence `0`, reason `classifier_failure_safe_suppression`, and sends nothing.

## Canonical vendor acceptance case

The TheBoxPhotography pricing solicitation is classified as `vendor_supplier_solicitation` with confidence `0.98`, is not sales eligible, and receives exactly once:

> Thanks for reaching out and sharing your photography services. We’ll keep your details for future consideration.

It never reaches the renovation reply composer or receives a property, floor-plan, “dream home,” appointment, or quotation prompt.

## Persistence and compatibility

Migration `027_v10_2_intent_gate_conversation_safety.sql` adds intent, eligibility, route, confidence, reason, classifier/manual-override, acknowledgement, latest-question, and safety-state columns plus three routing indexes and taxonomy constraints.

Application writes also store the same state under `intake_profile.trace.intentGate`. This is the compatibility fallback if application code is deployed before migration 027. Migration 027 backfills any such trace into physical columns before creating indexes.

Existing historical leads default to sales eligible until a real inbound message or Marcus manual correction classifies them. New WhatsApp contacts begin as `conversation_pending_classification` and cannot appear in sales workflows before the gate runs.

## Operator and observability controls

- The WhatsApp inbox explicitly includes routed non-sales conversations and displays intent, route, confidence, and eligibility.
- The normal lead list excludes non-sales by default and provides a dedicated review view.
- Non-sales lead detail renders conversation routing and messages, not sales/quotation surfaces.
- Marcus can set or clear a manual intent override from lead detail. The correction is permission-checked and audited.
- The protected System Health page aggregates recent intent counts, eligible rate, confidence buckets, manual corrections, inferred false positives, duplicate/unrelated blocks, no-reply suppressions, and vendor acknowledgements.
- Per-message audit metadata includes provider message ID, intent, eligibility, confidence, reason codes, classifier/rule version, manual override, and classification timestamp.

## Safety and rollback

The existing `WHATSAPP_TEST_AUTO_REPLY_ENABLED` kill switch, live/test mode pairing, credential guard, per-lead bot pause, deduplication, and safety validator remain active. A failed classifier, failed route persistence, semantic duplicate, explicit opt-out, spam/scam message, or human takeover produces no generic fallback.

Rollback order:

1. Set `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false` to stop client-facing auto replies immediately while inbound saving continues.
2. Roll the application back to the previous deployment if needed.
3. Leave migration 027 in place; all fields are additive and older application versions ignore them.
4. Do not drop routing columns or delete audit/raw-message evidence during an incident.
5. Re-enable auto reply only after `/api/whatsapp/health`, logs, audit records, and the v10.2 replay suites pass on the target deployment.

## Required verification

```bash
npm run test:v10.2
npm run typecheck
npm run lint
npm run build
npm run verify
```

Named v10.2 suites:

- `scripts/test_whatsapp_intent_gate.mjs`
- `scripts/test_non_sales_lead_exclusion.mjs`
- `scripts/test_reply_semantic_deduplication.mjs`
- `scripts/test_latest_unanswered_question.mjs`
- `scripts/test_existing_client_routing.mjs`
- `scripts/test_intent_gate_performance_budget.mjs`
