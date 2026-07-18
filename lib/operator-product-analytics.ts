"use client";

const SESSION_KEY = "limm-operator-session-v11";

function sessionId() {
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `session-${Date.now()}`;
  window.sessionStorage.setItem(SESSION_KEY, created);
  return created;
}

export function trackOperatorEvent(input: {
  eventName: string;
  leadId?: string;
  durationMs?: number;
  metadata?: Record<string, string | number | boolean>;
}) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ ...input, sessionId: sessionId() });
  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon("/api/analytics/events", new Blob([body], { type: "application/json" }));
    if (sent) return;
  }
  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true
  }).catch(() => null);
}
