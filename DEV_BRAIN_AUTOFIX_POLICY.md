# Dev Brain Autofix Policy

## Purpose

The Dev Brain QA system helps Codex inspect the Command Centre like a real user, classify issues, apply small safe fixes, rerun tests, and prepare clean reports for Marcus and ChatGPT.

This is not the client-facing sales AI brain.

## Auto-Fix Allowed

- Typo and copy cleanup.
- Button spacing and harmless layout polish.
- Human-readable label formatting.
- Broken internal links.
- Missing empty states.
- Duplicate headings.
- Preview-only badge clarity.
- Static test/report wording.
- Safe browser test selector improvements.

## Approval Required

- Database schema, RLS, or auth policy changes.
- OpenAI, WhatsApp, or Google Calendar integration.
- Pricing or quotation logic.
- Production deployment.
- Deleting data.
- Approval rule changes.
- Removing or changing audit log protections.
- Any change that could affect live client data.

## Hard Safety Boundaries

- Do not expose secrets or `.env.local` values.
- Do not use real client data in QA scenarios.
- Do not delete audit logs.
- Do not generate client-facing prices, amount ranges, or rough renovation estimates.
- Do not weaken the package audit.
- Keep mock mode available.

## Severity Classification

- Critical: security, auth bypass, data loss, audit failure, generated pricing, secrets, or live send risk.
- High: broken protected route, broken boss action, broken appointment setting persistence, or unsafe client wording.
- Medium: confusing UI, missing empty state, unclear role/status copy, or incomplete test coverage.
- Low: polish, spacing, report wording, or non-blocking browser-test ergonomics.
