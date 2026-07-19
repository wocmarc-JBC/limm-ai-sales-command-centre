import { NextResponse } from "next/server";
import { getCurrentProfile, requirePermission } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/data/audit-repository";
import { getLeadFileById, getSignedLeadFileUrl } from "@/lib/data/lead-files-repository";
import { createTraceId, withOperationalTrace } from "@/lib/operations/observability";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/operations/rate-limit";
import { retryWhatsAppMediaForLeadFile } from "@/lib/whatsapp-media-storage";

export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff"
};

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ fileId: string }> }
) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated) {
    return NextResponse.json({ ok: false, errorCode: "unauthorized" }, { status: 401, headers: privateHeaders });
  }

  const { fileId } = await paramsPromise;
  const download = new URL(request.url).searchParams.get("download") === "1";
  const signedUrl = await getSignedLeadFileUrl(fileId, 90, { download });
  if (!signedUrl) {
    return NextResponse.json(
      { ok: false, errorCode: "attachment_unavailable", errorMessage: "This attachment is not available." },
      { status: 404, headers: privateHeaders }
    );
  }

  return NextResponse.redirect(signedUrl, { status: 307, headers: privateHeaders });
}

export async function POST(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ fileId: string }> }
) {
  const permission = await requirePermission("update_leads");
  if (!permission.ok || !permission.auth.profile) {
    return NextResponse.json(
      { ok: false, errorCode: "permission_denied", errorMessage: permission.error || "Permission denied." },
      { status: 403, headers: privateHeaders }
    );
  }

  const { fileId } = await paramsPromise;
  const existing = await getLeadFileById(fileId);
  if (!existing || existing.fileStatus === "voided") {
    return NextResponse.json(
      { ok: false, errorCode: "attachment_not_found", errorMessage: "This attachment record was not found." },
      { status: 404, headers: privateHeaders }
    );
  }

  const traceId = createTraceId(request);
  const rate = await consumeRateLimit({
    identity: permission.auth.profile.id,
    action: "whatsapp_media_retry",
    limit: 8,
    windowSeconds: 60
  });
  const headers = { ...privateHeaders, ...rateLimitHeaders(rate), "X-LIMM-Trace-Id": traceId };
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, errorCode: "rate_limited", errorMessage: "Too many retries. Wait briefly and try again." },
      { status: 429, headers }
    );
  }

  const actor = permission.auth.profile;
  try {
    const recovered = await withOperationalTrace({
      traceId,
      leadId: existing.leadId,
      eventName: "whatsapp_media_retry",
      stage: "retrieve_and_store",
      metadata: { fileIdPresent: true }
    }, () => retryWhatsAppMediaForLeadFile(fileId, actor.fullName));
    return NextResponse.json({
      ok: true,
      fileId: recovered.id,
      leadId: recovered.leadId,
      availability: "ready"
    }, { headers });
  } catch (error) {
    const reasonCode = error instanceof Error ? error.name : "unknown_error";
    await createAuditLog({
      actorType: "user",
      actorName: actor.fullName,
      actorEmail: actor.email,
      actorId: actor.id,
      action: "whatsapp_media_retry_failed",
      entityType: "lead",
      entityId: existing.leadId,
      summary: "WhatsApp media retrieval retry failed; the client message remains visible for follow-up.",
      metadata: {
        fileId,
        reasonCode,
        tokenLogged: false,
        mediaUrlLogged: false
      }
    }).catch(() => undefined);
    return NextResponse.json({
      ok: false,
      errorCode: "media_retrieval_failed",
      errorMessage: "WhatsApp did not make this file available. Retry shortly or ask the client to resend it."
    }, { status: 502, headers });
  }
}
