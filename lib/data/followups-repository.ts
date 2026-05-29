import { createAuditLog } from "./audit-repository";
import { getDataMode } from "./data-source";
import { mapFollowUpRow } from "./mappers";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseServerClient } from "./supabase-server";
import type { FollowUpStatus } from "@/lib/types";

export async function listFollowUps() {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("followups")
      .select("*, leads(client_name)")
      .order("due_at", { ascending: true });
    if (!error && data) return data.map(mapFollowUpRow);
  }

  return mockClone(getMockStore().followUps);
}

export async function updateFollowUpStatus(id: string, status: FollowUpStatus, notes = "") {
  const before = (await listFollowUps()).find((item) => item.id === id) ?? null;
  const now = new Date().toISOString();
  const completedAt = status === "Completed" || status === "No Reply" ? now : null;

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("followups")
      .update({ status, notes, completed_at: completedAt })
      .eq("id", id)
      .select("*, leads(client_name)")
      .maybeSingle();
    if (!error && data) {
      const after = mapFollowUpRow(data);
      await createAuditLog({
        actorType: "boss",
        actorName: "Marcus",
        action: "followup_status_updated",
        entityType: "followup",
        entityId: id,
        summary: `Follow-up marked ${status}.`,
        beforeData: before ? { status: before.status } : null,
        afterData: { status: after.status, notes: after.notes }
      });
      return after;
    }
  }

  const store = getMockStore();
  const index = store.followUps.findIndex((item) => item.id === id);
  if (index === -1) return null;
  store.followUps[index] = { ...store.followUps[index], status, notes, completedAt };
  const after = store.followUps[index];
  await createAuditLog({
    actorType: "boss",
    actorName: "Marcus",
    action: "followup_status_updated",
    entityType: "followup",
    entityId: id,
    summary: `Follow-up marked ${status}.`,
    beforeData: before ? { status: before.status } : null,
    afterData: { status: after.status, notes: after.notes }
  });
  return mockClone(after);
}
