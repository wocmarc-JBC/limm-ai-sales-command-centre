import "server-only";

import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";

export type ClientFileRecoveryTask = "integrity" | "backup" | "restore_drill";

const ABANDONED_RECOVERY_RUN_MINUTES = 15;

export async function closeAbandonedClientFileRecoveryRuns(runType: ClientFileRecoveryTask) {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin credentials are required for client-file recovery cleanup.");

  const finalizedAt = new Date().toISOString();
  const cutoff = new Date(Date.now() - ABANDONED_RECOVERY_RUN_MINUTES * 60_000).toISOString();
  const { data, error } = await client
    .from("client_file_recovery_runs")
    .update({
      status: "failed",
      error_code: "runtime_timeout_or_abandoned",
      completed_at: finalizedAt,
      metadata: {
        finalizedBy: "client_file_recovery_runtime_guard",
        abandonedAfterMinutes: ABANDONED_RECOVERY_RUN_MINUTES,
        finalizedAt
      }
    })
    .eq("run_type", runType)
    .eq("status", "running")
    .lt("started_at", cutoff)
    .select("id");

  if (error) throw new Error(`Client-file abandoned-run cleanup failed: ${error.message}`);
  return data?.length ?? 0;
}
