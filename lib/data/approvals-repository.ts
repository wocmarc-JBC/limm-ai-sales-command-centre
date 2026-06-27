import { createAuditLog } from "./audit-repository";
import { getDataMode } from "./data-source";
import { mapApprovalRow } from "./mappers";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseServerClient } from "./supabase-server";
import { filterApprovalsForProductionVisibility, type ProductionVisibilityOptions } from "@/lib/production-visibility";
import type { ApprovalStatus } from "@/lib/types";

export type ListApprovalRequestsOptions = ProductionVisibilityOptions & {
  visibleLeadIds?: Set<string>;
};

export async function listApprovalRequests(options: ListApprovalRequestsOptions = {}) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("approval_requests")
      .select("*")
      .order("requested_at", { ascending: false });
    if (!error && data) return filterApprovalsForProductionVisibility(data.map(mapApprovalRow), options);
  }

  return filterApprovalsForProductionVisibility(mockClone(getMockStore().approvalRequests), options);
}

export async function decideApprovalRequest(id: string, status: ApprovalStatus, notes = "") {
  const before = (await listApprovalRequests()).find((item) => item.id === id) ?? null;
  const now = new Date().toISOString();

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data: userData } = await supabase!.auth.getUser();
    const { data, error } = await supabase!
      .from("approval_requests")
      .update({ status, notes, decided_by: userData.user?.id ?? null, decided_at: now })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (!error && data) {
      const after = mapApprovalRow(data);
      await createAuditLog({
        actorType: "boss",
        actorName: "Marcus",
        action: "approval_decision_recorded",
        entityType: "approval_request",
        entityId: id,
        summary: `Approval request marked ${status}.`,
        beforeData: before ? { status: before.status } : null,
        afterData: { status: after.status, notes: after.notes }
      });
      return after;
    }
  }

  const store = getMockStore();
  const index = store.approvalRequests.findIndex((item) => item.id === id);
  if (index === -1) return null;
  store.approvalRequests[index] = { ...store.approvalRequests[index], status, notes, decidedAt: now, decidedBy: "Marcus" };
  const after = store.approvalRequests[index];
  await createAuditLog({
    actorType: "boss",
    actorName: "Marcus",
    action: "approval_decision_recorded",
    entityType: "approval_request",
    entityId: id,
    summary: `Approval request marked ${status}.`,
    beforeData: before ? { status: before.status } : null,
    afterData: { status: after.status, notes: after.notes }
  });
  return mockClone(after);
}
