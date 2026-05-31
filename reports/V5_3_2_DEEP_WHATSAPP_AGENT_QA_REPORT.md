# V5.3.2 Deep WhatsApp Agent QA Report

Overall: PASS
Total test cases: 14
Passed: 14
Failed: 0

## Case Results

### PASS - files_exist
Failure category: foundation
Input: source tree
Expected behaviour: All v5.3.2 source, docs, and email handoff files exist.
Actual reply: (source/static proof case)
Recommended fix: None.

### PASS - exact_media_floor_plan_bug
Failure category: media
Input: image caption: can give me design ideas? filename: floorplan.jpg, then multi-intent text
Expected behaviour: Previous media is treated as floor plan/image context and reply does not ask for floor plan again.
Actual reply: Yes, we can help with the landed renovation, design direction and appointment request. Thanks, we've received the floor plan/image. For Wednesday 2pm, the team can help check availability, but the appointment is not confirmed yet. For wall hacking or approval matters, we need to review the drawings and site condition first because it depends on the wall type, structure, services, scope and whether submission is required. If possible, please also share site photos and the property area/address for an initial project review.
Recommended fix: None.

### PASS - document_floor_plan_price
Failure category: media
Input: document floorplan.pdf caption floor plan attached, then how much roughly?
Expected behaviour: Floor plan detected from document metadata; price reply does not ask for floor plan again.
Actual reply: I understand you'd like a rough idea. Thanks, we've received the floor plan and scope. We'll need to review the details, drawings, site condition and material direction first, because giving a rough figure too early can be misleading. The team can go through this properly during the initial project review.
Recommended fix: None.

### PASS - voice_audio_fallback
Failure category: voice
Input: type: audio / voice
Expected behaviour: No transcription; send approved typed-details fallback.
Actual reply: Sorry, we're not able to listen to voice messages here. Could you type the key details instead, such as your property type, renovation scope, and preferred appointment timing for an initial project review?
Recommended fix: None.

### PASS - singlish_understood_english_reply
Failure category: singlish
Input: how much ah / can make appt anot / got landed photo?
Expected behaviour: Singlish intents are recognized but replies remain professional English.
Actual reply: (source/static proof case)
Recommended fix: None.

### PASS - multi_intent_human_answer
Failure category: multi-intent
Input: appointment + design + landed + hacking + approval
Expected behaviour: Answers all major questions safely in one natural reply.
Actual reply: Yes, we can help with the landed renovation, design direction and appointment request. Thanks, we've received the floor plan/image. For Wednesday 2pm, the team can help check availability, but the appointment is not confirmed yet. For wall hacking or approval matters, we need to review the drawings and site condition first because it depends on the wall type, structure, services, scope and whether submission is required. If possible, please also share site photos and the property area/address for an initial project review.
Recommended fix: None.

### PASS - price_scope_first
Failure category: price
Input: how much ah
Expected behaviour: Approved price-safe wording, no amount or range.
Actual reply: I understand you'd like a rough idea. Thanks, we've received the floor plan and scope. We'll need to review the details, drawings, site condition and material direction first, because giving a rough figure too early can be misleading. The team can go through this properly during the initial project review.
Recommended fix: None.

### PASS - appointment_context_aware
Failure category: appointment
Input: can make appt wed 2pm? with prior floor plan/scope
Expected behaviour: Acknowledges received info, does not confirm appointment.
Actual reply: Wednesday 2pm noted. We can help check availability, but the appointment is not confirmed yet. Thanks, we've received the floor plan and scope. The team will review and confirm whether that slot works for an initial project review.
Recommended fix: None.

### PASS - portfolio_instagram
Failure category: portfolio
Input: can see your past works?
Expected behaviour: Routes to official LIMM Instagram and never fakes photos.
Actual reply: Yes, you can view some of our renovation works, design references and project-related content on our Instagram here:

https://www.instagram.com/limmworks/

If you're looking for a specific type of reference, let us know whether it's for landed A&A, kitchen, bathroom, carpentry, hacking works, design works or commercial renovation. We can then point you to the more relevant examples for your initial project review.
Recommended fix: None.

### PASS - human_escalation
Failure category: escalation
Input: urgent / call me / paid deposit / refund / lawyer
Expected behaviour: Human handoff wording without legal/refund argument.
Actual reply: Thanks, I'll get the team to follow up with you directly on this. Could you share the key details or photos/messages related to the issue so it can be checked properly for an initial project review?
Recommended fix: None.

### PASS - email_handoff
Failure category: email
Input: important lead trigger
Expected behaviour: Email handoff to limmwork@gmail.com with provider-safe fallback and cooldown.
Actual reply: (source/static proof case)
Recommended fix: None.

### PASS - trace_update
Failure category: trace
Input: black box trace
Expected behaviour: Trace includes media, Singlish, escalation, email, and duplicate suppression fields.
Actual reply: (source/static proof case)
Recommended fix: None.

### PASS - health_v5_3_2
Failure category: health
Input: /api/whatsapp/health
Expected behaviour: Health proves v5.3.2 features with booleans only.
Actual reply: (source/static proof case)
Recommended fix: None.

### PASS - adapter_payload_preserved
Failure category: payload
Input: WhatsApp Cloud API adapter
Expected behaviour: Known-good text payload shape remains unchanged.
Actual reply: (source/static proof case)
Recommended fix: None.

## Safety Summary

- Pricing/quote ranges/package prices: blocked by sample and source checks.
- Appointment confirmation without calendar event: blocked.
- Approval, hacking, structural and completion certainty: blocked.
- Voice transcription: disabled; typed-details fallback required.
- Email handoff: provider-safe fallback required when provider is missing.
- Known-good WhatsApp payload: preserved by adapter proof checks.

