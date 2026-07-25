import "server-only";

import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";

export type ClientFileRecoveryTask = "integrity" | "backup" | "restore_drill";

const ABANDONED_RECOVERY_RUN_MINUTES = 15;

type AbandonedRecoveryRun = {
  id: string;
  metadata: Record<string, unknown> | null;
};

export async function closeAbandonedClientFileRecoveryRuns(runType: ClientFileRecoveryTask) {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin credentials are required for client-file recovery cleanup.");

  const finalizedAt = new Date();
  const cutoff = new Date(finalizedAt.getTime() - ABANDONED_RECOVERY_RUN_MINUTES * 60_000).toISOString();
  const { data, error } = await client
    .from("client_file_recovery_runs")
    .select("id,metadata")
    .eq("run_type", runType)
    .eq("status", "running")
    .lt("last_progress_at", cutoff)
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${finalizedAt.toISOString()}`);
  if (error) throw new Error(`Client-file abandoned-run lookup failed: ${error.message}`);

  let closed = 0;
  for (const run of (data ?? []) as AbandonedRecoveryRun[]) {
    const { data: updated, error: updateError } = await client
      .from("client_file_recovery_runs")
      .update({
        status: "failed",
        error_code: "runtime_timeout_or_abandoned",
        completed_at: finalizedAt.toISOString(),
        last_progress_at: finalizedAt.toISOString(),
        continuation_required: false,
        lease_token: null,
        lease_expires_at: null,
        metadata: {
          ...(run.metadata ?? {}),
          finalizedBy: "client_file_recovery_runtime_guard",
          abandonedAfterMinutes: ABANDONED_RECOVERY_RUN_MINUTES,
          finalizedAt: finalizedAt.toISOString()
        }
      })
      .eq("id", run.id)
      .eq("status", "running")
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error(`Client-file abandoned-run cleanup failed: ${updateError.message}`);
    if (updated?.id) closed += 1;
  }
  return closed;
}
