# Next Steps For ChatGPT

## Review First

1. Review `docs/V6_HUMAN_LIKE_SALES_BRAIN.md`.
2. Review `reports/V6_HUMAN_LIKE_SALES_BRAIN_DEEP_QA_REPORT.md`.
3. Review `docs/V5_3_2_DEEP_QA_MEDIA_SINGLISH_VOICE_EMAIL_HANDOFF.md`.
4. Review `reports/V5_3_2_DEEP_WHATSAPP_AGENT_QA_REPORT.md`.
5. Review `docs/V5_3_1_MULTI_INTENT_LEAD_CONTEXT_PORTFOLIO.md`.
6. Confirm `/api/whatsapp/health` shows `version: v6_0_human_like_sales_brain` before any live WhatsApp retest.

## Recommended Next Prompt For Marcus PowerShell

Prepare the controlled live v6 WhatsApp retest:

- Keep all v4/v5 safety rules unchanged.
- Confirm health endpoint first; local PASS is not production PASS.
- v6 adds human-like reply planning, Context Truth Gate, Singapore renovation shorthand understanding, Safety Governor, Reply Quality Judge, and 150+ case QA.
- OpenAI WhatsApp reply remains off.
- Optional AI v6 interpreter/drafter flags remain off by default.
- Calendar auto-booking remains off.
- No pricing, amount ranges, package prices, or booking confirmation before a real event exists.
- Do not send project photos automatically.
- Test the v6 live sequence and inspect CRM audit logs for the expanded black box reply trace.

## Marcus PowerShell Commands

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm.cmd run build
node scripts/test_v5_3_whatsapp_reply_coach_replay.mjs
node scripts/test_v5_3_1_multi_intent_lead_context_portfolio.mjs
node scripts/test_v5_3_2_deep_whatsapp_agent_qa.mjs
node scripts/test_v6_human_like_sales_brain_deep_qa.mjs
node scripts/audit_v3_package.mjs
```

## What Codex Should Build Next

- The next phase should only happen after Marcus confirms v6 deployed health and live retest results.
- Recommended next scope: CRM trace viewer for v6 decisions and then optional AI interpreter testing behind explicit env flags.
- Optional OpenAI/AI WhatsApp reply testing should remain disabled until v6 deterministic local brain is proven live.

## Avoid

- Do not enable OpenAI WhatsApp reply by default.
- Do not enable autonomous Calendar booking.
- Do not send project photos automatically.
- Do not invent Instagram handles or fake past project photos.
- Do not auto-generate pricing or amount ranges.
- Do not add WhatsApp blasting or broadcast.
- Do not live test before deployed health proves v6.0.
