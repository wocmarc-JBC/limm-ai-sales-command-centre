import { NextResponse } from "next/server";
import { getCurrentProfile, requirePermission } from "@/lib/auth/session";
import {
  addInboxInternalNote,
  claimInboxConversation,
  getInboxTeamState,
  recordAiQualityObservation,
  recordOperatorProductEvent,
  releaseInboxConversation
} from "@/lib/data/team-inbox-repository";
import { createTraceId, recordOperationalEvent } from "@/lib/operations/observability";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/operations/rate-limit";
import type { AiQualityDecision } from "@/lib/operations/contracts";

const QUALITY_DECISIONS = new Set<AiQualityDecision>(["accepted", "edited", "rejected", "unsafe"]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function limitFor(actorId: string, action: string) {
  return consumeRateLimit({ identity: actorId, action, limit: 90, windowSeconds: 60 });
}

export async function GET(request: Request, { params: paramsPromise }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await paramsPromise;
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const rate = await limitFor(auth.profile.id, "inbox_team_read");
  if (!rate.allowed) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(rate) });
  const traceId = createTraceId(request);
  const startedAt = performance.now();
  const state = await getInboxTeamState(leadId);
  await recordOperationalEvent({ traceId, leadId, eventName: "inbox_team_state", stage: "read", status: "ok", durationMs: performance.now() - startedAt }).catch(() => false);
  return NextResponse.json({ ok: true, traceId, ...state }, { headers: { ...rateLimitHeaders(rate), "X-LIMM-Trace-Id": traceId } });
}

export async function POST(request: Request, { params: paramsPromise }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await paramsPromise;
  const permission = await requirePermission("update_leads");
  if (!permission.ok || !permission.auth.profile) {
    return NextResponse.json({ ok: false, error: permission.error || "permission_denied" }, { status: 403 });
  }
  const actor = permission.auth.profile;
  const rate = await limitFor(actor.id, "inbox_team_write");
  if (!rate.allowed) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(rate) });
  let payload: Record<string, unknown> = {};
  try { payload = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const action = text(payload.action, 40);
  const traceId = createTraceId(request);
  const startedAt = performance.now();

  try {
    if (action === "claim") {
      const result = await claimInboxConversation(leadId, actor);
      await recordOperatorProductEvent({ eventName: "conversation_claimed", actorId: actor.id, leadId, metadata: { claimed: result.claimed } });
      await recordOperationalEvent({ traceId, leadId, eventName: "inbox_assignment", stage: "claim", status: result.claimed ? "ok" : "degraded", durationMs: performance.now() - startedAt, errorCode: result.claimed ? "" : result.reason });
      return NextResponse.json({ ok: result.claimed, traceId, ...result }, { status: result.claimed ? 200 : 409, headers: rateLimitHeaders(rate) });
    }
    if (action === "release") {
      const result = await releaseInboxConversation(leadId, actor);
      await recordOperatorProductEvent({ eventName: "conversation_released", actorId: actor.id, leadId, metadata: { released: result.released } });
      await recordOperationalEvent({ traceId, leadId, eventName: "inbox_assignment", stage: "release", status: result.released ? "ok" : "degraded", durationMs: performance.now() - startedAt, errorCode: result.released ? "" : result.reason });
      return NextResponse.json({ ok: result.released, traceId, ...result }, { status: result.released ? 200 : 409, headers: rateLimitHeaders(rate) });
    }
    if (action === "note") {
      const body = text(payload.body, 2000);
      if (!body) return NextResponse.json({ ok: false, error: "empty_note" }, { status: 400 });
      const mentions = Array.isArray(payload.mentions) ? payload.mentions.map((value) => text(value, 80)).filter(Boolean).slice(0, 12) : [];
      const note = await addInboxInternalNote({ leadId, body, mentions, actor });
      await recordOperatorProductEvent({ eventName: "internal_note_added", actorId: actor.id, leadId, metadata: { mentionCount: mentions.length, lengthBucket: body.length < 100 ? "short" : body.length < 500 ? "medium" : "long" } });
      await recordOperationalEvent({ traceId, leadId, eventName: "inbox_note", stage: "create", status: "ok", durationMs: performance.now() - startedAt });
      return NextResponse.json({ ok: true, traceId, note }, { headers: rateLimitHeaders(rate) });
    }
    if (action === "quality_feedback") {
      const decision = text(payload.decision, 20) as AiQualityDecision;
      if (!QUALITY_DECISIONS.has(decision)) return NextResponse.json({ ok: false, error: "invalid_decision" }, { status: 400 });
      await recordAiQualityObservation({
        leadId,
        messageId: text(payload.messageId, 80) || null,
        traceId,
        reply: "",
        primaryMove: "operator_review",
        qualityScores: { operatorOutcome: decision },
        decision,
        feedback: text(payload.feedback, 500),
        reviewedBy: actor.id,
        metadata: { source: "inbox_operator_review" }
      });
      await recordOperatorProductEvent({ eventName: "ai_quality_feedback", actorId: actor.id, leadId, metadata: { decision } });
      return NextResponse.json({ ok: true, traceId, decision }, { headers: rateLimitHeaders(rate) });
    }
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 100) : "operation_failed";
    await recordOperationalEvent({ traceId, leadId, eventName: "inbox_team_mutation", stage: action || "unknown", status: "failed", durationMs: performance.now() - startedAt, errorCode: code }).catch(() => false);
    return NextResponse.json({ ok: false, error: code, traceId }, { status: 500, headers: rateLimitHeaders(rate) });
  }
}
