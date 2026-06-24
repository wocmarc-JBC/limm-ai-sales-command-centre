import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { listLeadMessagesPage } from "@/lib/data/lead-messages-repository";

export async function GET(request: Request) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const leadId = url.searchParams.get("leadId") ?? "";
  const before = url.searchParams.get("before") ?? undefined;
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "missing_lead_id" }, { status: 400 });
  }

  const page = await listLeadMessagesPage(leadId, 30, before);
  return NextResponse.json({
    ok: true,
    messages: page.messages,
    hasOlder: page.hasOlder,
    oldestCursor: page.oldestCursor
  });
}
