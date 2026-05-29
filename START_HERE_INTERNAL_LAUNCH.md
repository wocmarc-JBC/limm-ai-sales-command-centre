# LIMM AI Sales Command Centre v4.5 - Internal Launch Start Here

Status: GO for controlled internal use by Marcus.

This is not a full public production launch. Use it as an internal boss command centre for live CRM review, lead handling, appointment settings, follow-up tracking, quotation readiness review, and audit visibility.

## What Is Enabled

- Boss login through the existing Supabase/Auth foundation.
- Lead inbox and lead detail review.
- Appointment settings with configurable weekdays, including Sunday.
- Boss approval queue.
- Follow-up queue.
- Quotation readiness review with no pricing output.
- Audit log visibility.
- System Health screen.
- Mock fallback mode for local/demo use.

## What Stays Disabled

- OpenAI brain: disabled.
- WhatsApp integration: disabled.
- Calendar live booking: disabled.
- Auto-pricing: disabled.
- Quote range generation: disabled.
- Rough estimate generation: disabled.
- Review route: disabled by default.
- Public production mode: not approved yet.

## Safe Internal Start

Use this PowerShell command:

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
.\START_INTERNAL_LAUNCH_SAFE.ps1
```

If PowerShell blocks scripts, use the BAT wrapper:

```powershell
cd "C:\Users\Lenovo\Documents\Sales CRM Agent\LIMM_AI_Sales_Command_Centre_v3"
.\START_INTERNAL_LAUNCH_SAFE.bat
```

Keep the app window open while using the CRM. Close the terminal window only when you are done.

## First Internal Checks

- Login works.
- Current user role shows boss.
- Leads are visible.
- Appointment settings load and save.
- Audit logs are visible.
- Follow-ups are visible.
- Quotation readiness is visible.
- Review route is unavailable by default.
- OpenAI, WhatsApp, and Calendar show disabled.

## Operating Rule

Use the system for controlled internal operations only. Do not connect public traffic, WhatsApp, OpenAI replies, or live calendar booking until the next phase is built and separately tested.
