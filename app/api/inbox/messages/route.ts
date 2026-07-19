import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { listLeadFiles } from "@/lib/data/lead-files-repository";
import { listLeadMessagesAfter, listLeadMessagesPage } from "@/lib/data/lead-messages-repository";
import { attachLeadFilesToMessages } from "@/lib/inbox-message-attachments";

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
    const [messages, files] = await Promise.all([
      listLeadMessagesAfter(leadId, after, 30),
      listLeadFiles(leadId)
    ]);
    return NextResponse.json({
      ok: true,
      messages: attachLeadFilesToMessages(messages, files)
    });
  }

  const [page, files] = await Promise.all([
    listLeadMessagesPage(leadId, 30, before),
    listLeadFiles(leadId)
  ]);
  return NextResponse.json({
    ok: true,
    messages: attachLeadFilesToMessages(page.messages, files),
    hasOlder: page.hasOlder,
    oldestCursor: page.oldestCursor
  });
}
