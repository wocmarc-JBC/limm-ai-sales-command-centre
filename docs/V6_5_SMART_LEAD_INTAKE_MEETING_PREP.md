# v6.5 Smart Lead Intake + Meeting Prep Brain

Status: implemented locally; pending push/deploy health proof.

## What Changed

- Added a structured Smart Lead Intake profile on each lead.
- Added a missing-info detector with a strict 3-5 next-question cap.
- Added lifestyle, occupants, helper, pets, safety needs, budget expectation, timeline, key collection, move-in date, and preferred meeting timing fields.
- Added Meeting Readiness and Proposal Readiness scores.
- Added a lead detail checklist showing collected, partial, and missing intake fields.
- Added a boss-save action that persists intake fields and writes audit action `lead_intake_fields_updated`.
- Added additive Supabase migration `022_v6_5_smart_lead_intake.sql` for `leads.intake_profile`.
- Updated health proof to `v6_5_smart_lead_intake_meeting_prep`.

## Safety Rules

- Budget expectation is collected only for planning context.
- The system must not generate prices, amount ranges, package prices, or rough estimates.
- Calendar auto-booking remains disabled.
- Booking confirmation is not allowed unless a real Calendar event exists.
- OpenAI WhatsApp reply remains off by default.
- The intake brain asks only missing information and avoids overwhelming the client.

## Missing Info Detector

The intake brain checks existing lead fields and recent lead messages for:

- Property type
- Scope of work
- Floor plan or drawing
- Site photos
- Address or property area
- Lifestyle needs
- Occupants
- Helper requirements
- Pets
- Safety or accessibility needs
- Budget expectation
- Timeline
- Key collection
- Move-in date
- Preferred meeting timing

It then suggests only the next 3-5 useful questions. If fewer than three fields are missing, it asks only what is actually missing.

## Readiness Scores

Meeting readiness is weighted toward information Marcus needs before an initial project review:

- Property type
- Scope
- Floor plan/site photos
- Address or area
- Preferred meeting timing
- Timeline

Proposal readiness is weighted toward fuller planning context:

- Scope
- Floor plan/site photos
- Lifestyle, occupants, helper, pets, and safety needs
- Budget expectation
- Timeline and move-in constraints

## Live Schema

Run migration:

```sql
supabase/migrations/022_v6_5_smart_lead_intake.sql
```

It adds:

```sql
leads.intake_profile jsonb not null default '{}'
```

The migration is additive and idempotent.

## Health Proof

After deployment, open:

```text
https://limm-ai-sales-command-centre.vercel.app/api/whatsapp/health
```

Expected fields:

- `version: v6_5_smart_lead_intake_meeting_prep`
- `salesBrainVersion: v6.5`
- `smartLeadIntakeAvailable: true`
- `intakeChecklistAvailable: true`
- `missingInfoDetectorAvailable: true`
- `intakeQuestionLimitAvailable: true`
- `intakeQuestionLimitMin: 3`
- `intakeQuestionLimitMax: 5`
- `lifestyleOccupantsPetsSafetyAvailable: true`
- `budgetExpectationCollectionNoPriceReply: true`
- `timelineKeyMoveInCollectionAvailable: true`
- `meetingReadinessScoreAvailable: true`
- `proposalReadinessScoreAvailable: true`
- `leadIntakeProfileStorageAvailable: true`
- `leadIntakeAuditTraceAvailable: true`
- `openaiWhatsappReplyEnabled: false`
- `calendarAutoBookingEnabled: false`

## Marcus Live Retest

1. Open a real protected lead detail page.
2. Confirm the Smart Lead Intake panel appears.
3. Save lifestyle, occupants, helper, pets, safety, budget expectation, timeline, key collection, and move-in notes.
4. Confirm Meeting Readiness and Proposal Readiness update.
5. Confirm the suggested questions show only missing fields and stay within 3-5 questions.
6. Open Audit Log and confirm `lead_intake_fields_updated`.
7. Confirm no pricing, no quote ranges, no rough estimates, and no booking confirmation were generated.

## Remaining Limitations

- Intake fields are manually saved by Marcus/admin from the lead detail page.
- WhatsApp intake extraction remains deterministic and lightweight; OpenAI is not enabled.
- Calendar booking foundation remains boss-approved only and disabled by default.
