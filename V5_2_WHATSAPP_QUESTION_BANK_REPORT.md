# v5.2 WhatsApp Question Bank Report

## Status

PASS.

## Files Changed

- `lib/whatsapp-question-bank.ts`
- `lib/whatsapp-sales-brain.ts`
- `components/LeadCard.tsx`
- `app/leads/[id]/page.tsx`
- `scripts/test_v5_2_whatsapp_question_bank.mjs`
- `scripts/dev_brain_qa.mjs`
- `scripts/generate_chatgpt_handoff_report.mjs`
- `scripts/audit_v3_package.mjs`
- `package.json`
- `WHATSAPP_QUESTION_BANK_PLAYBOOK.md`
- `V5_2_WHATSAPP_QUESTION_BANK_REPORT.md`
- `CURRENT_STATUS.md`
- `NEXT_STEPS_FOR_CHATGPT.md`
- `CHATGPT_HANDOFF_REPORT.md`
- `WHATSAPP_AUTO_REPLY_SAFETY_RULES.md`
- `LIVE_INTEGRATION_PRODUCTION_PROOF_PLAYBOOK.md`

## Question Bank Coverage

The v5.2 question bank does not hardcode 10,000 exact replies. It uses structured intents, example questions, keyword matching, safe answer strategies, risk flags, escalation rules, and multiple reply variations.

Current coverage:

- Categories: 24
- Example questions: 87

Covered high-value categories:

- General enquiry
- Landed renovation
- A&A works
- Design theme / design concept
- Price / quotation / estimate
- Site visit / appointment
- Follow-up ping
- Floor plan/photos received
- Condo renovation
- Commercial renovation
- Hacking / demolition
- Carpentry
- Timeline
- Submission / permit / authority
- Structural / wall
- Waterproofing / drainage / roof
- Bathroom / kitchen
- Small handyman / not suitable
- Complaint / angry client
- Spam / unrelated
- Unsupported media
- Repeated enquiry
- Unsupported / unclear

## Integration Status

The WhatsApp Sales Brain now checks the question bank before selecting a fallback template. The matched playbook intent, safe answer strategy, required missing information, risk flags, and escalation rule are used to shape the reply and audit metadata.

If OpenAI is enabled later, the matched question bank intent and safe answer strategy are included in the prompt. OpenAI remains optional and off by default.

## Example Replies

Landed enquiry:

> Thanks for reaching out. For landed renovation, it is best not to advise blindly because layout, access and site conditions can affect the scope. Could you send the floor plan or site photos if available? We can take a look properly for an initial project review.

Price question:

> I understand you would want to get a sense of cost. To avoid giving you the wrong idea, we need to understand the scope, layout and site condition first. Could you send the floor plan, site photos and the areas you plan to renovate for an initial project review?

Appointment request:

> Thanks for checking. We can look into a suitable time, but before confirming anything we should understand the basic scope first. Could you send the floor plan or site photos and the property area for an initial project review?

Design theme:

> Yes, we can help review the design direction. To make the concept practical, we should first understand the layout, scope and your preferred style. Could you send the floor plan, site photos or any reference images for an initial project review?

Complaint / risk:

> I understand this needs to be handled carefully. I will get my manager to review the matter properly before any next step is advised for an initial project review.

## Safety Result

Safety remains enforced:

- no generated pricing
- no amount ranges
- no rough numbers
- no package amounts
- no booking confirmation before calendar event exists
- no approval, permit, hacking, structural, or completion certainty
- risky categories mark boss review required
- complaints are boss-only
- repeated price pressure escalates instead of looping

## Non-Repetition Result

The reply selector uses the last three outbound WhatsApp replies. It avoids exact matches and high-similarity repeats, uses alternate question-bank variations, and marks boss review required if it cannot produce a distinct safe answer.

Audit metadata now includes:

- `question_bank_intent`
- `matched_examples`
- `matched_keywords`
- `reply_strategy`
- `safety_category`
- `escalation_required`
- `escalation_rule`
- `escalation_reason`
- `follow_up_question`
- `repetition_checked`
- `repeated_detected`

## UI Result

Lead cards now show a useful category badge when the latest WhatsApp message matches the question bank. Lead detail already displays the matched question intent, latest question bank category, reply strategy, escalation status, and escalation reason from outbound reply metadata.

## Live WhatsApp Pipe

Preserved:

- webhook route
- health endpoint
- debug parser endpoint
- server-only Supabase write path
- known-good Meta payload shape
- WhatsApp safety validator
- audit log requirements
- emergency off behavior

## Tests Run

- `node scripts/test_v5_2_whatsapp_question_bank.mjs` - PASS
- `npm.cmd run build` - PASS
- `npm.cmd run qa:dev-brain` - PASS WITH MANUAL AUTH REQUIRED
- `node scripts/audit_v3_package.mjs` - PASS

## Audit Result

PASS: package audit passed. Dev Brain also ran the embedded package audit after cleaning generated folders.

## Remaining Limitations

- Matching is deterministic keyword/example based; Marcus should tune keywords after real conversations.
- OpenAI WhatsApp reply remains off by default.
- Calendar booking remains boss-approved foundation only.
- The question bank improves coverage but does not replace human boss review for risky cases.

## Go / No-Go

GO for controlled live WhatsApp question-bank reply testing.

NO-GO remains for pricing, quote ranges, autonomous Calendar booking, WhatsApp blasting, public marketing automation, or bypassing boss review on risky cases.
