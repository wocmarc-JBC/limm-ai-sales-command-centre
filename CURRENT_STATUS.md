# Current Status

## v5.0 WhatsApp Sales Brain + Calendar Foundation

Status: implemented for controlled live testing.

What changed:

- WhatsApp replies now use a structured sales brain before sending.
- OpenAI WhatsApp reply is off by default.
- Fallback replies still work without OpenAI.
- Replies are selected from a warmer, more context-aware template bank.
- Repetition guard checks the last outbound WhatsApp replies.
- Friendly care tone check prevents cold command-style replies.
- Safety validator still blocks pricing, quote ranges, rough estimates, package prices, forbidden consultation wording, approval promises, permit certainty, completion guarantee, structural certainty, and booking confirmation before an event exists.
- Audit metadata records intent, reply source, safety, tone, repetition, appointment intent, booking readiness, and Calendar status.
- Calendar booking foundation exists, but Calendar booking disabled by default.
- Boss approval required by default.
- Auto booking disabled by default.
- WhatsApp cannot confirm booking until a Calendar event exists.

Current Go/No-Go:

- GO for controlled live WhatsApp reply brain testing.
- GO for boss-approved Calendar booking foundation review.
- NO-GO for autonomous Calendar booking, pricing, WhatsApp blasting, payment collection, or public marketing automation.

## v4.10 WhatsApp Live PASS

Status: PASS.

Confirmed live production result:

- Vercel live deployment works.
- Meta WhatsApp webhook works.
- `/api/whatsapp/health` passes.
- WhatsApp inbound message was received.
- Supabase writes work.
- Lead was created in CRM.
- Lead appears in the Leads page.
- Audit logs show `whatsapp_inbound_received`.
- Audit logs show `whatsapp_auto_reply_requested`.
- Audit logs show `whatsapp_auto_reply_sent`.
- WhatsApp Graph API send works.
- Auto-reply was sent successfully to WhatsApp.

Working live configuration:

- `WHATSAPP_LIVE_INBOUND_ENABLED=true`
- `WHATSAPP_TEST_AUTO_REPLY_ENABLED=true`
- `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=true`
- `WHATSAPP_TEST_MODE=false`
- `SUPABASE_SERVICE_ROLE_KEY` present server-side
- `WHATSAPP_PHONE_NUMBER_ID` uses the registered phone number ID
- `WHATSAPP_ACCESS_TOKEN` valid
- `WHATSAPP_BUSINESS_NUMBER` present

Current Go/No-Go:

- GO for Marcus-approved WhatsApp live reply-only auto-reply.
- NO-GO for WhatsApp blasting, Calendar booking, payment collection, pricing, quote ranges, rough estimates, or approval bypass.
- OpenAI live brain remains disabled.
- Calendar remains disabled.

## v4.9 Live Deployment Readiness

Status: v4.9 Vercel deployment and production WhatsApp webhook readiness implemented.

Current goal:

- Deploy the CRM to Vercel.
- Run Marcus-approved live WhatsApp auto-reply mode.
- Keep WhatsApp reply-only, audited, safety-gated, and kill-switch controlled.
- Confirm inbound WhatsApp logging and outbound auto-reply in Vercel logs and CRM audit logs.

Deployment readiness files:

- `PRODUCTION_ENV_VARS_CHECKLIST.md`
- `VERCEL_DEPLOYMENT_GUIDE.md`
- `META_WHATSAPP_WEBHOOK_LIVE_SETUP.md`
- `V4_9_LIVE_DEPLOYMENT_READINESS_REPORT.md`

Go/No-Go:

- GO for deploying the CRM to Vercel.
- GO for Marcus-approved live WhatsApp auto-reply mode after health endpoint confirms required booleans.
- NO-GO for WhatsApp blasting, Calendar booking, payment collection, pricing, quote ranges, or any approval bypass.

## v4.4 Production Lockdown / Internal Launch Gate

Status: V4.4 REVIEW ROUTE LOCKDOWN IMPLEMENTED.

Confirmed baseline from Marcus:

- v4.2 Full Browser Human QA: PASS / GO.
- v4.3 Authenticated Boss-Write Browser QA: PASS / GO for v4.3 scope.
- Dev Brain QA: PASS.
- Live Supabase schema verifier: PASS.
- Authenticated live actions verifier: PASS.
- Playwright browser QA: PASS.
- Package audit: PASS.
- Bugs remaining: none.

New v4.4 lockdown work:

- `/review-chatgpt-ui` is now development-only.
- The review route is unavailable by default.
- To enable it for local UI review, set `NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=true`.
- Shell/auth exemptions for the review route only apply when that flag is explicitly enabled.
- Normal app routes are unchanged.
- Internal QA scripts are preserved.
- Tests and package audit now check that the review route is flag-gated.

## Production Safety Status

- OpenAI live brain remains disabled.
- WhatsApp supports closed test mode and Marcus-approved live auto-reply mode.
- WhatsApp auto-reply stays behind kill switches.
- Calendar remains disabled.
- No pricing, quote ranges, estimated prices, package prices, or rough estimates were added.
- Sunday remains configurable by appointment settings.
- Audit logs remain required for important actions.
- Credentials and passwords were not printed or stored.

## Verification Note

Bundled-Node checks passed in this Codex run:

- `scripts/test_v3_foundation.mjs`
- `scripts/test_v3_supabase_layer.mjs`
- `scripts/test_v3_auth_rls_static.mjs`
- `scripts/test_v3_live_setup_static.mjs`
- `scripts/test_v3_review_route_static.mjs`
- `scripts/test_v4_1_dev_brain_static.mjs`
- `scripts/test_v4_launch_candidate.mjs`
- `scripts/audit_v3_package.mjs`

This Codex sandbox cannot run Marcus's normal PowerShell browser commands because `npm.cmd` is unavailable here and plain `node.exe` is blocked. Marcus PowerShell must run the final browser commands:

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm.cmd run qa:browser
npm.cmd run qa:v4-3
npm.cmd run qa:dev-brain
node scripts/audit_v3_package.mjs
```

## Must Not Be Changed Before Internal Launch

- Do not enable OpenAI live actions.
- Do not enable WhatsApp blasting or any unapproved public campaign sending.
- Do not enable Google Calendar live booking.
- Do not generate prices or amount ranges.
- Do not hardcode Sunday as blocked.
- Do not weaken audit logs.
- Do not enable `/review-chatgpt-ui` in production.

## v4.8 WhatsApp Auto-Reply Status

Status: WhatsApp closed test mode and Marcus-approved live auto-reply mode are implemented behind kill switches.

Default state remains safe:

- `WHATSAPP_LIVE_INBOUND_ENABLED=false`
- `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false`
- `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false`
- `WHATSAPP_TEST_MODE=true`

Closed test mode:

- `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false`
- `WHATSAPP_TEST_MODE=true`

Marcus-approved live mode:

- `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=true`
- `WHATSAPP_TEST_MODE=false`

Calendar booking, blasting, pricing, quote ranges, and approval bypass remain NO-GO.

## v4.9 Deployment Status

The app remains a standard Next.js app:

- Build command: `npm run build`
- Production webhook route: `/api/whatsapp/webhook`
- Expected Meta callback URL: `https://YOUR-VERCEL-URL/api/whatsapp/webhook`
- No local tunnel URL is hardcoded.
- Review route is disabled by default.
- Service role and WhatsApp access tokens remain server-only.

---

# Live Integration Rule

For any real external integration such as WhatsApp, Meta, Calendar, payment, email, OpenAI actions, SMS, webhook, or client-facing automation, do not treat Codex PASS, local QA, browser QA, build PASS, package audit, or webhook GET verification as production proof.

Before Marcus tests any live action, the deployed production app must have:
- production health endpoint
- deployed version marker
- safe env booleans
- first-line production logs
- phase-by-phase logs
- safe JSON errors
- no top-level env/import crashes
- server-only secret proof
- audit log proof
- kill switch and rollback guide

Full rule: see `LIVE_INTEGRATION_PRODUCTION_PROOF_PLAYBOOK.md`.

## v5.2 WhatsApp Question Bank Status

Status: WhatsApp Question Bank + Reply Playbook is implemented and verified PASS.

The v5.2 layer adds a scalable question bank instead of hardcoding thousands of exact replies. It covers structured question bank intent handling for common LIMM Works homeowner conversations:

- general enquiry
- landed enquiry
- A&A enquiry
- design theme
- price question
- appointment request
- follow-up ping
- floor plan/photos received
- condo enquiry
- commercial enquiry
- hacking / demolition
- carpentry
- timeline
- submission / authority
- structural / wall
- waterproofing / drainage / roof
- bathroom / kitchen
- small handyman / fit review
- complaint / risk
- spam / unrelated

The live WhatsApp pipe remains preserved. The question bank adds better reply selection, safe answer strategy, missing information, risk flags, escalation rules, non-repetition handling, and audit metadata. OpenAI WhatsApp reply remains off by default, Calendar booking remains boss-approved foundation only, and no pricing or booking confirmation is added.

