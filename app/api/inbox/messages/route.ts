import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { listLeadMessagesAfter, listLeadMessagesPage } from "@/lib/data/lead-messages-repository";

export async function GET(request: Request) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const leadId = url.searchParams.get("leadId") ?? "";
  const before = url.searchParams.get("before") ?? undefined;
  const after = url.searchParams.get("after") ?? undefined;
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "missing_lead_id" }, { status: 400 });
  }

  if (after) {
    const messages = await listLeadMessagesAfter(leadId, after, 30);
    return NextResponse.json({
      ok: true,
      messages
    });
  }

  const page = await listLeadMessagesPage(leadId, 30, before);
  return NextResponse.json({
    ok: true,
    messages: page.messages,
    hasOlder: page.hasOlder,
    oldestCursor: page.oldestCursor
  });
}
