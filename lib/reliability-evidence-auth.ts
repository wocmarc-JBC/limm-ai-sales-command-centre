import "server-only";

import { timingSafeEqual } from "node:crypto";

export function authorizeReliabilityEvidence(request: Request) {
  const configured = process.env.RELIABILITY_EVIDENCE_TOKEN || "";
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (configured.length < 32 || supplied.length !== configured.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
}
