# v4.6 OpenAI Brain Dry-Run Adapter Report

Status: PASS.

## Scope

v4.6 adds a server-only OpenAI brain dry-run adapter for safe draft recommendations inside the CRM. It does not enable live replies, WhatsApp, Calendar booking, auto-approval, or pricing.

## What Was Added

- Explicit dry-run config flag: `OPENAI_BRAIN_DRY_RUN=false`.
- Server-only OpenAI runtime status helper.
- Structured dry-run recommendation type.
- OpenAI adapter that requests strict JSON only.
- Safety validator for AI output.
- Safe fallback recommendation when OpenAI is unavailable, disabled, fails, or returns invalid output.
- Persistence for dry-run recommendations in `lead_ai_decisions`.
- Audit log entry when a safe dry-run recommendation is saved.
- Lead detail UI panel showing dry-run status, draft notice, validation status, boss note, and draft reply.
- Static v4.6 safety test.

## Required Safety Behavior

- OpenAI brain remains off by default.
- CRM still works without an OpenAI key.
- Dry-run output is marked: `Draft only — boss approval required`.
- No auto-send.
- No WhatsApp.
- No Calendar booking.
- No auto-pricing.
- No quote ranges.
- No rough estimates.
- No appointment setting override.
- No approval gate bypass.
- Boss approval required.

## Validator Behavior

The validator rejects:

- Non dry-run output.
- Missing draft notice.
- Missing structured decision fields.
- Auto booking.
- Missing boss approval requirement.
- Invalid division, category, or appointment type.
- Unsafe client reply wording.
- Pricing, amount, range, estimate, package, approval promise, completion guarantee, permit certainty, or hacking certainty wording.
- Any output implying live sending or booking.

## Default Runtime

Default state is disabled because `.env.example` sets:

```powershell
OPENAI_BRAIN_DRY_RUN=false
```

If Marcus enables dry-run but leaves `OPENAI_API_KEY` empty, the app uses safe fallback only and continues running.

## QA Results

- Browser QA: PASS WITH MANUAL AUTH REQUIRED. 76 passed, 5 credential-dependent tests skipped.
- v4.3 boss-write QA: PASS command path verified; browser test skipped here because test credentials were not available in this runner.
- Dev Brain QA: PASS. Live Supabase network check was marked manual/skipped in this runner; browser QA, static tests, cleanup, and package audit passed.
- Package audit: PASS.

## Bugs Found And Fixed

- Lead detail route timeout in unauthenticated Supabase Mode after the dry-run panel was added. Fixed by short-circuiting lead-detail data fetches when the user is not authenticated, allowing the protected shell to render immediately.
- Dev Brain cleanup could fail on Windows when generated folders were still briefly locked after browser QA. Fixed with retry-based cleanup and Windows-safe npm execution.

## Remaining Limitations

- This is not client-facing automation.
- No WhatsApp connection.
- No Calendar booking.
- No live auto-send.
- No autonomous action.
- OpenAI output is only a boss-review draft.

## Recommendation

GO only for controlled internal dry-run testing after Marcus intentionally enables `OPENAI_BRAIN_DRY_RUN=true`. Public production remains NO-GO.
