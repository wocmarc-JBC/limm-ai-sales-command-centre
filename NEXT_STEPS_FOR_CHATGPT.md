# Next Steps For ChatGPT

## Review First

1. Review `docs/V5_3_2_DEEP_QA_MEDIA_SINGLISH_VOICE_EMAIL_HANDOFF.md`.
2. Review `reports/V5_3_2_DEEP_WHATSAPP_AGENT_QA_REPORT.md`.
3. Review `docs/V5_3_1_MULTI_INTENT_LEAD_CONTEXT_PORTFOLIO.md`.
4. Review `V5_3_WHATSAPP_REPLY_COACH_REPORT.md`.
5. Review `WHATSAPP_REPLY_COACH_PLAYBOOK.md`.
6. Review `WHATSAPP_NO_SILENCE_REPLY_RELIABILITY_RULES.md`.
7. Confirm `/api/whatsapp/health` shows `version: v5_3_2_deep_qa_media_singlish_voice_email_handoff` before any live WhatsApp retest.

## Recommended Next Prompt For Marcus PowerShell

Prepare the controlled live v5.3.2 WhatsApp retest:

- Keep all v4/v5 safety rules unchanged.
- Confirm health endpoint first; local PASS is not production PASS.
- v5.3.2 adds deep QA, media/floor-plan context repair, voice fallback, Singlish intent understanding with English replies, and email handoff trace support.
- OpenAI WhatsApp reply remains off.
- Calendar auto-booking remains off.
- No pricing, amount ranges, package prices, or booking confirmation before a real event exists.
- Do not send project photos automatically.
- Test the v5.3.2 media-first live sequence and inspect CRM audit logs for the expanded black box reply trace.

## Marcus PowerShell Commands

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm.cmd run build
node scripts/test_v5_3_whatsapp_reply_coach_replay.mjs
node scripts/test_v5_3_1_multi_intent_lead_context_portfolio.mjs
node scripts/test_v5_3_2_deep_whatsapp_agent_qa.mjs
node scripts/audit_v3_package.mjs
```

## What Codex Should Build Next

- v5.4 should only happen after Marcus confirms v5.3.2 deployed health and live retest results.
- Recommended v5.4 scope: human takeover lock if a reliable manual-reply signal exists, plus a CRM trace viewer for WhatsApp reply decisions.
- Optional OpenAI WhatsApp reply testing should remain disabled until v5.3.2 is proven live.

## Avoid

- Do not enable OpenAI WhatsApp reply by default.
- Do not enable autonomous Calendar booking.
- Do not send project photos automatically.
- Do not invent Instagram handles or fake past project photos.
- Do not auto-generate pricing or amount ranges.
- Do not add WhatsApp blasting or broadcast.
- Do not live test before deployed health proves v5.3.2.
