import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { recordOperatorProductEvent } from "@/lib/data/team-inbox-repository";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/operations/rate-limit";

const ALLOWED_EVENTS = new Set([
  "conversation_opened",
  "conversation_closed",
  "reply_sent",
  "reply_failed",
  "spam_reviewed",
  "queue_filter_changed",
  "older_messages_loaded",
  "realtime_recovered",
  "notification_enabled",
  "web_vital"
]);

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const rate = await consumeRateLimit({ identity: auth.profile.id, action: "operator_product_event", limit: 180, windowSeconds: 60 });
  if (!rate.allowed) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(rate) });
  let payload: Record<string, unknown> = {};
  try { payload = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const eventName = clean(payload.eventName, 80);
  if (!ALLOWED_EVENTS.has(eventName)) return NextResponse.json({ ok: false, error: "unsupported_event" }, { status: 400 });
  const metadata = payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
    ? Object.fromEntries(Object.entries(payload.metadata as Record<string, unknown>).flatMap(([key, value]) => {
      if (!/^(filter|source|status|result|pane|count|realtimeStatus|metric|value|delta|rating|route|device|navigationType)$/.test(key)) return [];
      return [[key, typeof value === "string" ? value.slice(0, 80) : typeof value === "number" || typeof value === "boolean" ? value : String(value).slice(0, 80)]];
    }))
    : {};
  const startedAt = Date.now();
  const stored = await recordOperatorProductEvent({
    eventName,
    actorId: auth.profile.id,
    leadId: clean(payload.leadId, 80) || null,
    sessionId: clean(payload.sessionId, 120),
    durationMs: typeof payload.durationMs === "number" ? Math.max(0, Math.min(payload.durationMs, 86400000)) : null,
    metadata
  });
  if (eventName === "web_vital") {
    console.log(JSON.stringify({
      level: "info",
      message: "operator_web_vital_recorded",
      metric: metadata.metric,
      value: metadata.value,
      rating: metadata.rating,
      route: metadata.route,
      device: metadata.device,
      stored,
      duration_ms: Date.now() - startedAt
    }));
  }
  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rate) });
}
