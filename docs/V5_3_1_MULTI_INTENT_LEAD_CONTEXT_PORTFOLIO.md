# v5.3.1 Multi-Intent Lead Context Portfolio

## Status

Implemented as a focused reply-quality upgrade on top of the v5.3 WhatsApp Reply Coach.

## What Changed

- Multi-intent detection now scans the whole inbound text instead of stopping at one intent.
- The Reply Coach can compose one natural combined reply for multi-question WhatsApp messages.
- Lead context memory checks existing CRM messages and lead fields before asking for more information.
- The agent avoids asking again for floor plan, site photos, scope, property type, address/area, or appointment time when those details are already detected.
- Price questions use the approved scope-first wording and never generate prices.
- Portfolio and past-work requests route to the official LIMM Works Instagram URL: `https://www.instagram.com/limmworks/`.
- The official URL is available through `NEXT_PUBLIC_LIMM_INSTAGRAM_URL`, `LIMM_INSTAGRAM_URL`, or the safe built-in official fallback.
- Black box reply trace now includes detected intents, primary intent, lead context, missing fields asked, repeated info avoided, portfolio routing, and combined-reply status.

## Multi-Intent Example

Input:

`can make appt for wed 2pm? can you come up with design theme? Hi, I want to renovate my landed house. can hack wall? need approval?`

Expected detected intents:

- appointment request
- design theme
- landed renovation
- hacking/wall
- approval/submission

Expected behavior:

- answer that LIMM can help with landed renovation, design direction, and appointment request
- explain design direction depends on layout, lighting, storage needs, and preferred style
- note Wednesday 2pm as a requested slot, but do not confirm it
- caution that wall hacking and approval matters need drawings/site review
- ask only for missing information for an initial project review

## Lead Context Memory

The checker infers whether the lead has already provided:

- floor plan
- site photos
- scope of work
- property type
- property address/area
- preferred appointment date/time
- design reference images
- portfolio/past-work request

It uses existing lead fields, inbound messages, message body text, and message metadata. No schema migration is required.

## Avoid Repeated Info Requests

If floor plan is already detected, the reply acknowledges it instead of asking again.

If floor plan and scope are already detected, price-safe replies say:

`I understand you'd like a rough idea. Thanks, we've received the floor plan and scope...`

If site photos are missing, the agent asks only for site photos.

## Price / Budget Rule

Every price or budget reply starts with:

`I understand you'd like a rough idea.`

The agent never gives:

- price
- quote range
- rough estimate
- package price
- "from $X"
- "usually around $X"

## Portfolio / Instagram Routing

Supported triggers:

- past works
- past project
- project photos
- portfolio
- before after
- show me your work
- renovation photos
- completed project
- design photos

Environment variables:

- `LIMM_INSTAGRAM_URL=https://www.instagram.com/limmworks/`
- `NEXT_PUBLIC_LIMM_INSTAGRAM_URL=https://www.instagram.com/limmworks/`

The app must not invent any other Instagram handle. If Marcus changes the official account later, update the env value and safe fallback together.

## Photo Sending Policy

v5.3.1 does not send images automatically.

No random photos, stock photos, or unapproved project images are sent. Future automatic photo sending requires an approved project photo library with categories such as:

- landed A&A
- full house renovation
- kitchen
- bathroom
- carpentry
- hacking
- masonry
- condo
- commercial
- design works
- before/after

## Safety Rules

Still blocked:

- pricing or amount ranges
- rough estimates
- package prices
- appointment confirmation before a real event exists
- approval/permit certainty
- hacking/wall/structural certainty
- completion guarantee
- forbidden consultation wording
- fake project photo claims

## Live Retest Sequence

After Vercel health proves v5.3.1:

1. `hello`
2. `are you there?`
3. `how much roughly?`
4. `can make appt for wed 2pm?`
5. `can you come up with design theme?`
6. `can make appt for wed 2pm? can you come up with design theme? Hi, I want to renovate my landed house. can hack wall? need approval?`
7. `can see your past works?`
8. `got any landed project photos?`
9. `I already sent floor plan and scope. how much roughly?`
10. `I already sent floor plan and scope. can make appt wed 2pm?`

## Rollback

If live behavior is wrong:

1. Set `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false`.
2. Redeploy.
3. Confirm health shows outbound auto-reply disabled.
4. Verify inbound messages still save.
5. Restore previous commit if needed.
