import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";
import { getDataMode } from "@/lib/data/data-source";

type LocalWindow = { count: number; resetAt: number };
const localWindows = new Map<string, LocalWindow>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
  source: "database" | "instance_fallback";
};

function localRateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const current = localWindows.get(key);
  const next = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + windowSeconds * 1000 }
    : { count: current.count + 1, resetAt: current.resetAt };
  localWindows.set(key, next);
  if (localWindows.size > 1000) {
    for (const [storedKey, value] of localWindows) if (value.resetAt <= now) localWindows.delete(storedKey);
  }
  return {
    allowed: next.count <= limit,
    remaining: Math.max(0, limit - next.count),
    resetAt: new Date(next.resetAt).toISOString(),
    source: "instance_fallback"
  };
}

export async function consumeRateLimit(input: {
  identity: string;
  action: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const rawKey = `${input.action}:${input.identity}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  if (getDataMode() === "Mock Mode") return localRateLimit(keyHash, input.limit, input.windowSeconds);
  const admin = getSupabaseAdminClient();
  if (admin) {
    const { data, error } = await admin.rpc("consume_api_rate_limit", {
      p_key_hash: keyHash,
      p_window_seconds: input.windowSeconds,
      p_limit: input.limit
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!error && row) {
      return {
        allowed: Boolean(row.allowed),
        remaining: Number(row.remaining ?? 0),
        resetAt: String(row.reset_at),
        source: "database"
      };
    }
  }
  return localRateLimit(keyHash, input.limit, input.windowSeconds);
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": result.resetAt,
    "X-RateLimit-Source": result.source
  };
}
