# Internal Launch Checklist

Use this checklist each time Marcus starts controlled internal use.

## 1. Startup

- Run `.\START_INTERNAL_LAUNCH_SAFE.ps1`.
- Confirm the terminal shows internal controlled use mode.
- Confirm OpenAI, WhatsApp, and Calendar are disabled.
- Confirm the app opens at `http://localhost:3000`.
- Confirm there are no startup errors.

## 2. Login And Role

- Login works.
- Marcus profile loads.
- Role shows boss.
- Logout is available only after login.
- Protected pages block access after logout.

## 3. Lead Operations

- Leads are visible.
- Lead detail page opens.
- Lead status can be reviewed.
- Lead next best action is visible.
- Risk flags and missing information are readable.
- No client-facing price, range, or rough estimate appears.

## 4. Appointment Settings

- Appointment settings load.
- Weekday labels are human-readable.
- Sunday is controlled by settings.
- Sunday can be enabled if Marcus wants Sunday slots.
- Sunday can be disabled if Marcus does not want Sunday slots.
- Settings save successfully.
- Audit log records the settings action.

## 5. Approval Queue

- Boss approval queue is visible.
- Approval reason is visible.
- Risk and recommendation are visible.
- Approve, reject, or request more information actions are only used for controlled internal testing.
- Audit log records the approval action.

## 6. Follow-Ups

- Follow-up queue is visible.
- Follow-up due items are readable.
- Suggested messages do not include forbidden pricing or unsafe promises.
- Complete, snooze, or no-reply actions are tested only on test records.
- Audit log records the follow-up action.

## 7. Quotation Readiness

- Quotation readiness page is visible.
- Readiness score is visible.
- Missing information is visible.
- Boss review required status is visible.
- Checklist is visible.
- No auto-pricing, quote ranges, rough estimates, or package prices appear.

## 8. Audit Logs

- Audit log page loads.
- Recent test actions appear.
- Actor information is populated.
- Audit logs are not deleted through normal app actions.

## 9. Review Route Lock

- `/review-chatgpt-ui` is unavailable by default.
- Review route is used only when intentionally enabled for a temporary UI review.
- Review route is never used with real client data.

## 10. Internal Launch Decision

Internal use is OK only if all items above pass. If any core item fails, stop and run the QA command set before using the CRM again.
