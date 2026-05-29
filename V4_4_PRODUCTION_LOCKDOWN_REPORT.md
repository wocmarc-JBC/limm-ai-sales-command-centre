# V4.4 Production Lockdown / Internal Launch Gate Report

## Status

Status: IMPLEMENTED, FINAL MARCUS POWERSHELL BROWSER RERUN REQUIRED.

## Scope

This phase locks down temporary development-only surfaces before internal launch. It does not enable OpenAI, WhatsApp, Google Calendar, pricing, or production deployment.

## Review Route Result

- `/review-chatgpt-ui` is now development-only.
- It is unavailable by default.
- It is only enabled when `NEXT_PUBLIC_ENABLE_REVIEW_ROUTE=true`.
- Shell/auth review-route exemptions only apply when that flag is enabled.
- The default state is safe for production and internal launch review.

## Files Changed

- `lib/review-route.ts`
- `app/review-chatgpt-ui/page.tsx`
- `components/ShellChrome.tsx`
- `components/auth/AuthGate.tsx`
- `tests/e2e/review-route.spec.ts`
- `tests/e2e/route-checks.spec.ts`
- `tests/e2e/v4-2-human-browser.spec.ts`
- `scripts/test_v3_foundation.mjs`
- `scripts/test_v3_review_route_static.mjs`
- `scripts/test_v4_1_dev_brain_static.mjs`
- `scripts/audit_v3_package.mjs`
- `scripts/dev_brain_qa.mjs`
- `scripts/generate_chatgpt_handoff_report.mjs`
- `scripts/generate_v4_2_browser_report.mjs`
- `.env.example`
- `CURRENT_STATUS.md`
- `OPEN_ISSUES.md`
- `NEXT_STEPS_FOR_CHATGPT.md`
- `CHATGPT_HANDOFF_REPORT.md`
- `LAUNCH_CHECKLIST.md`
- `GO_LIVE_MANUAL_STEPS.md`
- `V4_4_PRODUCTION_LOCKDOWN_REPORT.md`

## Test Coverage Added / Updated

- Review route disabled by default when the flag is off.
- Review route enabled behavior remains available for local UI review when the flag is true.
- Review route does not expose live action controls when disabled.
- Browser human QA route coverage understands the default disabled review route.
- Static package audit now requires review-route flag gating.
- Dev Brain static checks now require the lockdown test coverage.

## Verification Results From This Codex Run

Bundled Node checks completed:

- PASS: `scripts/test_v3_foundation.mjs`
- PASS: `scripts/test_v3_supabase_layer.mjs`
- PASS: `scripts/test_v3_auth_rls_static.mjs`
- PASS: `scripts/test_v3_live_setup_static.mjs`
- PASS: `scripts/test_v3_review_route_static.mjs`
- PASS: `scripts/test_v4_1_dev_brain_static.mjs`
- PASS: `scripts/test_v4_launch_candidate.mjs`
- PASS: `scripts/audit_v3_package.mjs`

Exact Marcus PowerShell commands attempted in this sandbox:

- FAIL TO RUN HERE: `npm.cmd run qa:browser` because `npm.cmd` is not available in this sandbox.
- FAIL TO RUN HERE: `npm.cmd run qa:v4-3` because `npm.cmd` is not available in this sandbox.
- FAIL TO RUN HERE: `npm.cmd run qa:dev-brain` because `npm.cmd` is not available in this sandbox.
- FAIL TO RUN HERE: `node scripts/audit_v3_package.mjs` because plain `node.exe` is blocked by this sandbox.

The package audit itself passed with the bundled workspace Node runtime.

## Safety Verification

- OpenAI remains disabled.
- WhatsApp remains disabled.
- Google Calendar remains disabled.
- No pricing, quote ranges, estimated prices, package prices, or rough estimates were added.
- Sunday remains configurable through settings.
- Audit logging rules were not weakened.
- No secrets were printed or stored.
- `.env.example` documents the review flag without secrets.

## Commands To Run In Marcus PowerShell

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
npm.cmd run qa:browser
npm.cmd run qa:v4-3
npm.cmd run qa:dev-brain
node scripts/audit_v3_package.mjs
```

## Go / No-Go

Recommendation: GO for internal launch gate only after the final Marcus PowerShell browser rerun passes.

Not full production GO yet. Backups, monitoring, deployment separation, and production launch audit are still required before public production.
