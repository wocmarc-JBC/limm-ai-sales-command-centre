import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { updateFollowUpStatus } from "@/lib/data/followups-repository";
import { markLeadFollowedUp, updateLeadSalesTracking } from "@/lib/data/leads-repository";
import type { FollowUpStatus } from "@/lib/types";

export async function POST(request: Request) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    action?: "done" | "snooze" | "no_reply";
    followUpId?: string;
    leadId?: string;
  } | null;
  const action = body?.action;
  const followUpId = body?.followUpId?.trim();
  const leadId = body?.leadId?.trim();
  if (!action || (!followUpId && !leadId)) {
    return NextResponse.json({ ok: false, error: "missing_followup_or_lead" }, { status: 400 });
  }

  if (followUpId) {
    const status: FollowUpStatus = action === "snooze" ? "Snoozed" : action === "no_reply" ? "No Reply" : "Completed";
    const result = await updateFollowUpStatus(followUpId, status);
    if (!result) return NextResponse.json({ ok: false, error: "followup_update_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, mode: "followup", followUpId, status: result.status });
  }

  if (action === "done") {
    const result = await markLeadFollowedUp(leadId!, auth.profile?.fullName ?? "Marcus");
    if (!result) return NextResponse.json({ ok: false, error: "lead_followup_update_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, mode: "lead", leadId, status: "Completed" });
  }

  if (action === "snooze") {
    const followUpDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const result = await updateLeadSalesTracking(
      leadId!,
      { followUpDate, needsMarcus: false },
      "Lead follow-up snoozed for one day from Follow-Ups."
    );
    if (!result) return NextResponse.json({ ok: false, error: "lead_snooze_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, mode: "lead", leadId, status: "Snoozed", followUpDate });
  }

  return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
}
