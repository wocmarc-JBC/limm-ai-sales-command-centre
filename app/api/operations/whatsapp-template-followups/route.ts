import { NextRequest, NextResponse } from "next/server";
import { authorizeReliabilityScheduler } from "@/lib/reliability-scheduler-auth";
import { runAutomaticApprovedTemplateFollowups } from "@/lib/whatsapp-auto-template-followups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 09:15 SGT daily; only Vercel/Supabase scheduler bearer secrets are permitted. */
export async function GET(request: NextRequest) {
  const caller = await authorizeReliabilityScheduler(request);
  if (!caller) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const result = await runAutomaticApprovedTemplateFollowups();
    return NextResponse.json({
      ok: true,
      caller,
      ...result,
      note: result.enabled
        ? result.templateApproved ? "Meta-accepted messages still require webhook delivery confirmation." : "No sends: template approval is missing."
        : "No sends: automated approved-template follow-ups are disabled."
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "auto_template_followup_evidence_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
