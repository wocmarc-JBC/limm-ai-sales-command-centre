import { createAuditLog } from "./audit-repository";
import { getDataMode } from "./data-source";
import { mapFollowUpRow } from "./mappers";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseServerClient } from "./supabase-server";
import { isTestFollowUp } from "@/lib/test-lead-cleanup";
import { isSalesEligibleLead } from "@/lib/whatsapp-intent-gate";
import type { FollowUp, FollowUpStatus } from "@/lib/types";

export type ListFollowUpsOptions = {
  page?: number;
  pageSize?: number;
  status?: "active" | "due_today" | "overdue" | "snoozed" | "completed" | "all";
  search?: string;
  includeTest?: boolean;
  includeCompleted?: boolean;
  scanAll?: boolean;
};

const activeStatuses: FollowUpStatus[] = ["Due", "Overdue", "Scheduled", "Snoozed", "No Reply"];

function nowSingaporeDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
}

function classifyTiming(item: FollowUp) {
  const dueTime = Date.parse(item.dueAt);
  const now = Date.now();
  const dueDate = Number.isNaN(dueTime) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date(dueTime));
  if (item.status === "Snoozed") return "snoozed";
  if (item.status === "Completed") return "completed";
  if (!Number.isNaN(dueTime) && dueTime < now) return "overdue";
  if (dueDate && dueDate === nowSingaporeDate()) return "due_today";
  return "scheduled";
}

function urgencyRank(item: FollowUp) {
  const timing = classifyTiming(item);
  if (timing === "overdue") return 1;
  if (timing === "due_today") return 2;
  if (timing === "scheduled") return 3;
  if (timing === "snoozed") return 4;
  return 5;
}

function shouldShowFollowUp(item: FollowUp, options: ListFollowUpsOptions = {}) {
  const status = options.status ?? "active";
  if (item.lead && !isSalesEligibleLead(item.lead)) return false;
  if (!options.includeTest && isTestFollowUp(item)) return false;
  if (!options.includeCompleted && status !== "completed" && status !== "all" && (item.status === "Completed" || item.completedAt)) return false;

  if (status === "active" && !activeStatuses.includes(item.status)) return false;
  if (status === "due_today" && classifyTiming(item) !== "due_today") return false;
  if (status === "overdue" && classifyTiming(item) !== "overdue") return false;
  if (status === "snoozed" && item.status !== "Snoozed") return false;
  if (status === "completed" && item.status !== "Completed" && !item.completedAt) return false;

  const search = (options.search ?? "").trim().toLowerCase();
  if (search) {
    const haystack = [
      item.clientName,
      item.lead?.phone,
      item.lead?.scopeSummary,
      item.lead?.lastClientMessage,
      item.templateType,
      item.followupType,
      item.suggestedMessage,
      item.notes
    ].join("\n").toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  return true;
}

function sortFollowUps(items: FollowUp[]) {
  return [...items].sort((a, b) => {
    const rank = urgencyRank(a) - urgencyRank(b);
    if (rank !== 0) return rank;
    return (Date.parse(a.dueAt) || 0) - (Date.parse(b.dueAt) || 0);
  });
}

export function filterAndPageFollowUps(items: FollowUp[], options: ListFollowUpsOptions = {}) {
  const page = Math.max(1, Number(options.page ?? 1) || 1);
  const maxPageSize = options.scanAll ? 500 : 20;
  const pageSize = Math.min(maxPageSize, Math.max(1, Number(options.pageSize ?? 20) || 20));
  const filtered = sortFollowUps(items).filter((item) => shouldShowFollowUp(item, options));
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    hasMore: filtered.length > start + pageSize
  };
}

async function getFollowUpById(id: string) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("followups")
      .select("*, leads(*)")
      .eq("id", id)
      .maybeSingle();
    if (!error && data) return mapFollowUpRow(data);
  }

  const followUp = getMockStore().followUps.find((item) => item.id === id) ?? null;
  return followUp ? mockClone(followUp) : null;
}

export async function listFollowUpsPage(options: ListFollowUpsOptions = {}) {
  const page = Math.max(1, Number(options.page ?? 1) || 1);
  const maxPageSize = options.scanAll ? 500 : 20;
  const pageSize = Math.min(maxPageSize, Math.max(1, Number(options.pageSize ?? 20) || 20));
  const fetchLimit = options.includeTest || options.status === "all" ? 500 : Math.min(120, pageSize * 6);

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    let query = supabase!
      .from("followups")
      .select("*, leads(*)")
      .order("due_at", { ascending: true })
      .range(0, fetchLimit - 1);
    if (!options.includeCompleted && options.status !== "completed" && options.status !== "all") {
      query = query.neq("status", "Completed").neq("status", "completed");
    }
    const { data, error } = await query;
    if (!error && data) return filterAndPageFollowUps(data.map(mapFollowUpRow), { ...options, page, pageSize });
  }

  return filterAndPageFollowUps(mockClone(getMockStore().followUps), { ...options, page, pageSize });
}

export async function listFollowUps(options: ListFollowUpsOptions = {}) {
  return (await listFollowUpsPage(options)).items;
}

export async function countFollowUps(options: ListFollowUpsOptions = {}) {
  const items = getDataMode() === "Supabase Mode"
    ? await listFollowUps({ ...options, page: 1, pageSize: 20 })
    : mockClone(getMockStore().followUps);
  return filterAndPageFollowUps(items, { ...options, page: 1, pageSize: 20 }).total;
}

export async function updateFollowUpStatus(id: string, status: FollowUpStatus, notes = "") {
  const before = await getFollowUpById(id);
  if (before?.lead && !isSalesEligibleLead(before.lead)) {
    await createAuditLog({
      actorType: "system",
      actorName: "Intent Gate",
      action: "non_sales_followup_update_blocked",
      entityType: "followup",
      entityId: id,
      summary: "Follow-up update blocked because the linked conversation is not sales eligible.",
      beforeData: {
        status: before.status,
        conversationIntent: before.lead.conversationIntent,
        conversationRoute: before.lead.conversationRoute
      },
      afterData: null
    });
    return null;
  }
  const now = new Date().toISOString();
  const completedAt = status === "Completed" || status === "No Reply" ? now : null;
  const patch: Record<string, unknown> = { status, notes, completed_at: completedAt };
  if (status === "Snoozed") {
    const snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    patch.due_at = snoozedUntil;
    patch.completed_at = null;
    patch.notes = notes || "Snoozed for one day from Follow-Up Queue.";
  }
  if (status === "No Reply") {
    patch.notes = notes || "Marked no reply from Follow-Up Queue.";
  }
  if (status === "Completed") {
    patch.notes = notes || "Completed from Follow-Up Queue.";
  }

  if (getDataMode() === "Supabase Mode") {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase!
      .from("followups")
      .update(patch)
      .eq("id", id)
      .select("*, leads(*)")
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
  store.followUps[index] = {
    ...store.followUps[index],
    status,
    notes: String(patch.notes ?? ""),
    completedAt: patch.completed_at as string | null,
    dueAt: String(patch.due_at ?? store.followUps[index].dueAt)
  };
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

export async function hideTestFollowUp(id: string, reason: string) {
  return updateFollowUpStatus(id, "Completed", `v6.1.5 test follow-up cleanup: ${reason}`);
}
