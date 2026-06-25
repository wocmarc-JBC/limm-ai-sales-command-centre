import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { listLeadFiles } from "@/lib/data/lead-files-repository";
import { listLeadMessagesPage } from "@/lib/data/lead-messages-repository";
import { getLeadById, moveLeadToQuotationReadiness } from "@/lib/data/leads-repository";
import { buildQuotationReadinessGate } from "@/lib/phase3-read-models";

export async function POST(request: Request) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as { leadId?: string } | null;
  const leadId = body?.leadId?.trim();
  if (!leadId) return NextResponse.json({ ok: false, error: "missing_lead_id" }, { status: 400 });

  const lead = await getLeadById(leadId);
  if (!lead) return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });

  const [messagePage, files] = await Promise.all([
    listLeadMessagesPage(lead.id, 8),
    listLeadFiles(lead.id)
  ]);
  const gate = buildQuotationReadinessGate(lead, messagePage.messages, files);
  if (!gate.canMoveToQuotationReview) {
    return NextResponse.json({
      ok: false,
      error: "quotation_not_ready",
      status: gate.readinessStatus,
      reason: gate.disabledReason
    }, { status: 409 });
  }

  const updated = await moveLeadToQuotationReadiness(lead.id);
  if (!updated) return NextResponse.json({ ok: false, error: "move_failed" }, { status: 500 });
  return NextResponse.json({
    ok: true,
    leadId: lead.id,
    status: "Quotation Readiness",
    readinessStatus: gate.readinessStatus
  });
}
