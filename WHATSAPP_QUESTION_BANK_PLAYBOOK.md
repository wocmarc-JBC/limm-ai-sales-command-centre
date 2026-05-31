# v5.2 WhatsApp Question Bank Playbook

This playbook explains how the LIMM Works WhatsApp reply brain handles common homeowner questions without hardcoding thousands of fixed replies.

## Purpose

The question bank gives the agent structured coverage for many message variations by combining:

- question bank intent keys
- example homeowner questions
- classification keywords
- safe answer strategies
- required missing information
- risk flags
- escalation rules
- forbidden claims
- reply variations
- follow-up questions
- audit tags

The live WhatsApp pipe remains unchanged: inbound messages are parsed, saved, audited, validated, and sent through the known-good Meta payload contract.

## Coverage

The v5.2 question bank currently covers 24 categories and 87 example questions, including:

- General enquiry
- Landed enquiry
- A&A enquiry
- Design theme
- Price question
- Site visit request
- Appointment request
- Follow-up ping
- Floor plan/photos received
- Condo enquiry
- Commercial enquiry
- Hacking / demolition
- Carpentry
- Timeline question
- Submission / authority
- Structural / wall
- Waterproofing / drainage / roof
- Bathroom / kitchen
- Small handyman / not suitable
- Complaint / risk
- Spam / unrelated
- Unsupported media
- Repeated enquiry
- Unsupported / unclear

## Safe Reply Rules

Every answer must stay practical and safe:

- use "initial project review"
- acknowledge the client first
- explain why details are needed
- ask only the next useful question
- avoid repeating the exact previous reply
- avoid pricing, amounts, ranges, packages, or rough numbers
- avoid booking confirmation before a calendar event exists
- avoid authority, permit, structural, hacking, or timeline certainty
- escalate risky cases to boss review

## Escalation Rules

`auto_safe` means the template may be sent if all validators pass.

`auto_safe_with_boss_review` means the reply can be safe, but the case should still carry boss-review metadata because it involves risk such as landed, A&A, commercial, pricing, timeline, approval, structural, site visit, or special fit checks.

`boss_only` means the agent should not auto-handle the matter as a normal sales reply. Complaints, refund pressure, legal words, angry messages, or liability-sensitive matters require Marcus review.

`no_auto_reply` means the system should not engage unless Marcus decides.

## Key Intent Guidance

### Price Question

Safe strategy: never give an amount or range. Explain that scope, layout, and site condition must be reviewed first. Ask for floor plan, site photos, and areas involved.

Example safe reply:

> I understand you would want to get a sense of cost. To avoid giving you the wrong idea, we need to understand the scope, layout and site condition first. Could you send the floor plan, site photos and the areas you plan to renovate for an initial project review?

### Appointment Request

Safe strategy: do not confirm a booking. Say LIMM Works can check availability or look into an initial project review, then ask for scope, property area/address, floor plan or site photos.

Example safe reply:

> Thanks for checking. We can look into a suitable time, but before confirming anything we should understand the basic scope first. Could you send the floor plan or site photos and the property area for an initial project review?

### A&A / Landed

Safe strategy: mention site conditions and review needs without making approval or structural promises. Ask for drawings, floor plan, site photos, and scope.

Example safe reply:

> Thanks for sharing. For landed A&A works, items like roofline, drainage, waterproofing, access and submission requirements can affect the scope. If you have the floor plan or site photos, send them over and we will review it more properly for an initial project review.

### Complaint / Risk

Safe strategy: acknowledge calmly, do not argue, do not admit liability, and route to Marcus.

Example safe reply:

> I understand this needs to be handled carefully. I will get my manager to review the matter properly before any next step is advised for an initial project review.

## Non-Repetition

The sales brain checks the last three outbound WhatsApp replies before sending.

If a new reply is identical or highly similar:

- it tries a different question-bank variation
- it records repetition metadata
- if it still cannot produce a distinct safe answer, it marks boss review required
- repeated price pressure escalates instead of looping forever

Audit metadata includes:

- question bank intent
- matched examples
- matched keywords
- reply strategy
- safety category
- escalation required
- repetition checked
- repeated detected
- template key

## OpenAI Relationship

OpenAI WhatsApp reply remains off by default. If Marcus later enables it, the matched question bank intent and safe answer strategy are included in the prompt. OpenAI output still cannot go directly to WhatsApp; it must pass schema validation, safety validation, repetition checks, tone checks, calendar confirmation checks, and audit logging.

## Live Safety

The question bank is a reply-quality layer. It does not change:

- Meta webhook verification
- WhatsApp Graph API payload shape
- Supabase server-only write path
- audit log requirements
- health/debug diagnostic endpoints
- emergency off behavior
