import "server-only";

import { verifyWhatsAppSchedulerToken } from "@/lib/data/whatsapp-inbound-jobs-repository";

export type ReliabilitySchedulerSource = "vercel_cron" | "supabase_cron";

export async function authorizeReliabilityScheduler(request: Request): Promise<ReliabilitySchedulerSource | null> {
  const authorization = request.headers.get("authorization") || "";
  const vercelSecret = process.env.CRON_SECRET;
  if (vercelSecret && authorization === `Bearer ${vercelSecret}`) return "vercel_cron";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (token && await verifyWhatsAppSchedulerToken(token)) return "supabase_cron";
  return null;
}
