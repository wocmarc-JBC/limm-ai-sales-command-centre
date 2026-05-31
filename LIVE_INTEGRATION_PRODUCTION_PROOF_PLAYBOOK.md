# LIVE INTEGRATION RULE — PRODUCTION PROOF BEFORE USER TESTING

## v5.0 WhatsApp Sales Brain Rule

The known-good WhatsApp payload and production diagnostics must remain intact while improving reply quality.

Before Marcus tests v5.0 live replies, confirm:

- `/api/whatsapp/health` returns the WhatsApp, OpenAI WhatsApp, and Calendar booleans.
- OpenAI WhatsApp reply is off by default unless Marcus intentionally enables it.
- Fallback replies still send without OpenAI.
- Calendar booking disabled by default.
- Auto booking disabled by default.
- Boss approval required by default.
- No WhatsApp reply can confirm booking until an event exists.
- Audit logs record reply source, intent, safety, tone, repetition, and Calendar status.
- The known-good WhatsApp payload remains: `messaging_product`, `recipient_type`, digits-only `to`, `type: text`, `preview_url: false`, and safe `text.body`.

## v4.10 WhatsApp Live PASS Record

The LIMM AI Sales Command Centre WhatsApp integration has passed live proof for the current Marcus-approved number.

Confirmed:

- `/api/whatsapp/health` passes.
- Vercel live deployment works.
- Meta webhook works.
- Supabase write works.
- WhatsApp Graph API send works.
- WhatsApp inbound message was received.
- Lead was created and appeared in CRM.
- Audit logs showed `whatsapp_inbound_received`.
- Audit logs showed `whatsapp_auto_reply_requested`.
- Audit logs showed `whatsapp_auto_reply_sent`.
- Auto-reply was sent successfully to WhatsApp.

Working configuration:

- `WHATSAPP_LIVE_INBOUND_ENABLED=true`
- `WHATSAPP_TEST_AUTO_REPLY_ENABLED=true`
- `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=true`
- `WHATSAPP_TEST_MODE=false`
- `SUPABASE_SERVICE_ROLE_KEY` present server-side
- `WHATSAPP_PHONE_NUMBER_ID` uses the registered phone number ID
- `WHATSAPP_ACCESS_TOKEN` valid
- `WHATSAPP_BUSINESS_NUMBER` present

Major lessons recorded:

- Health endpoint first.
- Correct service role key required.
- Live DB schema must match code.
- Correct registered WhatsApp Phone Number ID required.
- Direct Graph API send test is useful to separate Meta credential issues from CRM adapter issues.
- Do not test live integrations before production diagnostics pass.

This rule applies to any app that connects to a real external service such as WhatsApp, Meta, Calendar, payment, email, OpenAI actions, SMS, webhook, or client-facing automation.

## Core Rule

Do not treat local QA, Codex PASS, browser QA, package audit, or build PASS as enough.

Built does not mean deployed.  
Deployed does not mean configured.  
Configured does not mean verified.  
Webhook GET verification does not mean POST processing works.  
Codex PASS does not mean production PASS.  
Only deployed production proof counts for live integrations.

## Required Before Marcus Tests Any Live Action

Before Marcus is asked to test any real live action, the deployed production app must prove:

1. Production health endpoint exists.
   - Example: `/api/whatsapp/health`
   - Shows required env/config as booleans only.
   - Never exposes secret values, tokens, URLs, service role keys, phone numbers, or API keys.

2. Deployed version marker exists.
   - Confirms Vercel/production is running the latest intended code.
   - Prevents testing old stale deployments.

3. Safe diagnostic endpoint exists where payload parsing matters.
   - Example: `/api/whatsapp/debug-parse`
   - Parses payload safely.
   - Does not write data.
   - Does not send external messages.
   - Does not expose secrets.

4. First-line production logging exists.
   - The live endpoint must log immediately when invoked.
   - Example: `whatsapp_webhook_received_start`
   - If this log does not appear, the route is not running or crashes before handler logic.

5. Phase-by-phase logs exist.
   For webhook/live integrations, log safe markers such as:
   - request received
   - payload parsed
   - config checked
   - dedupe checked
   - database write started
   - database write completed
   - audit written
   - external API request started
   - external API request completed
   - blocked / disabled / failure reason

6. Safe JSON error responses exist.
   - No silent `200 OK` if important processing failed.
   - Every `500` must return a safe error code.
   - Examples:
     - `config_error`
     - `missing_env`
     - `payload_parse_failed`
     - `unsupported_payload`
     - `supabase_insert_failed`
     - `audit_insert_failed`
     - `external_api_failed`
   - Never return secret values in errors.

7. Unsupported payload handling exists.
   - Unsupported/status-only webhook payloads should not crash.
   - They should return safe `200 ignored` response when appropriate.

8. No top-level env/import crashes.
   - Missing env vars must not crash a production route before logs.
   - Env validation must happen inside request handler or callable function with safe response.
   - No module should throw at import time because env is missing.

9. Server-only secret proof exists.
   - Service role keys, WhatsApp tokens, OpenAI keys, payment keys, and private credentials must never be exposed to frontend/client bundle.
   - No secret should use `NEXT_PUBLIC` unless it is intentionally public.

10. Production env verification happens after deployment.
   - Vercel env vars only count after deployment/redeployment.
   - Always confirm live health endpoint after redeploy before live testing.

11. Audit path is proven.
   - Important live actions must write audit logs.
   - Audit log must show actor/action/result/reason where applicable.
   - If audit insert fails, the failure must be visible and not silently swallowed.

12. Kill switch and rollback are documented.
   - Every live integration must have an emergency off switch.
   - Example: `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false`
   - Include rollback/deploy/redeploy instructions.
   - Include token rotation steps if a secret is exposed.

13. Live user-facing test comes last.
   Correct order:
   - latest code pushed to GitHub
   - latest Vercel deployment is Ready
   - production health endpoint passes
   - diagnostic endpoint passes if applicable
   - env vars visible as booleans
   - secrets server-only
   - safe logs and safe errors confirmed
   - audit path confirmed
   - kill switch documented
   - only then test real live user action

## LIVE INTEGRATION PRE-TEST CHECKLIST

Before Marcus tests any live WhatsApp/Calendar/OpenAI/payment/email/webhook action:

- [ ] Latest code pushed to GitHub
- [ ] Vercel latest deployment is Ready
- [ ] Deployment version marker confirms latest code
- [ ] Production health endpoint returns 200
- [ ] Required env vars show true as booleans
- [ ] Secrets are server-only and not exposed to frontend
- [ ] Diagnostic parser endpoint exists if payload parsing is involved
- [ ] First-line live log appears when endpoint is hit
- [ ] Phase-by-phase logs exist
- [ ] Safe JSON errors exist
- [ ] Unsupported payloads return safe ignored response
- [ ] Database write path tested
- [ ] Audit log write path tested
- [ ] External API call path tested or safely mocked
- [ ] Kill switch documented
- [ ] Rollback/redeploy steps documented
- [ ] Only then test the live user-facing action

## MUST NEVER HAPPEN

Do not ask Marcus to test a real live integration before the production endpoint can prove:

- it is the latest deployed version
- required env vars are visible
- secrets are server-only
- safe logs exist
- safe JSON errors exist
- audit logging works
- rollback / kill switch exists

Do not treat the following as proof that live POST/action processing works:

- Codex PASS
- local build PASS
- local browser QA PASS
- package audit PASS
- webhook GET verification PASS

## WHATSAPP LIVE RULE

For Meta WhatsApp Cloud API:

- GET webhook verification passing only proves Meta can verify callback URL.
- It does not prove inbound POST payloads parse correctly.
- It does not prove Supabase writes work.
- It does not prove audit logs work.
- It does not prove Graph API sending works.
- It does not prove auto-reply works.

Before sending real WhatsApp tests:

1. `/api/whatsapp/health` must pass.
2. `/api/whatsapp/debug-parse` must parse a sample payload.
3. POST `/api/whatsapp/webhook` must log:
   - `whatsapp_webhook_received_start`
   - `whatsapp_payload_parsed`
   - `whatsapp_lead_upserted`
   - `whatsapp_inbound_message_saved`
   - `whatsapp_audit_written`
4. If auto-reply is enabled, logs must show:
   - `whatsapp_auto_reply_enabled_state`
   - `whatsapp_auto_reply_sent`
   or the exact blocked/failed reason.
5. If webhook returns `500`, it must return safe JSON error with code.
6. No fake `200` if lead/message/audit processing failed.

## FUTURE CODEX RULE

For any live integration phase, Codex must build diagnostics before live testing:

- health endpoint
- safe env booleans
- deployed version marker
- safe parser/debug endpoint if needed
- first-line log
- phase logs
- safe JSON errors
- kill switch
- audit proof
- tests
- report

Do not return PASS unless production diagnostic paths are implemented and documented.
