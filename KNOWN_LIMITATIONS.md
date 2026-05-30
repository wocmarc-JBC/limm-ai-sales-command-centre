# Known Limitations - v4.9 Deployment Readiness

This version is approved for controlled internal use, not full public production.

## Disabled Integrations

- OpenAI live brain is disabled. OpenAI dry-run remains boss-review only when intentionally enabled.
- WhatsApp supports closed test auto-reply and Marcus-approved live auto-reply behind kill switches.
- Calendar live booking is disabled.
- Real file upload is disabled or placeholder-only.
- Review route is disabled by default.

## Sales And Quotation Limits

- The app does not auto-generate prices.
- The app does not generate quote ranges.
- The app does not generate rough estimates.
- The app does not promise authority approval.
- The app does not promise exact completion dates.
- The app does not give final structural, legal, or submission advice.

Quotation readiness is only an internal readiness tool. Marcus still needs to review scope, drawings, site conditions, materials, access, authority or management requirements, and risk before any actual quotation is prepared.

## Operational Limits

- Use controlled internal testing first.
- Do not treat this as a public production deployment.
- No WhatsApp blasting exists or should be added.
- Closed test mode requires `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=false` and `WHATSAPP_TEST_MODE=true`.
- Marcus-approved live mode requires `WHATSAPP_PUBLIC_AUTO_REPLY_ENABLED=true` and `WHATSAPP_TEST_MODE=false`.
- Emergency off is `WHATSAPP_TEST_AUTO_REPLY_ENABLED=false`.
- v4.9 Vercel deployment is only webhook-ready until Meta verifies the callback URL and inbound logging is confirmed.
- Expected future lead volume is around 60 leads per month.
- The system is designed to stay lean for future running cost control.

## Technical Limits

- Supabase credentials must stay in `.env.local` and must not be committed.
- Service role keys must not be used in frontend code.
- The app can run in Mock Mode if Supabase variables are missing.
- Live authenticated tests require `SUPABASE_TEST_EMAIL` and `SUPABASE_TEST_PASSWORD` only when Marcus intentionally runs them.
- Audit logs should not be deleted through normal app actions.

## What To Verify Manually

- Marcus can login as boss.
- Leads are visible.
- Appointment settings save correctly.
- Sunday enable/disable behaves as expected.
- Audit logs show recent actions.
- Follow-ups and quotation readiness pages load.
- Review route is unavailable unless explicitly enabled for review.

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

