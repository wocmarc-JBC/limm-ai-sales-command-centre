import { randomUUID } from "node:crypto";
import { getDataMode } from "./data-source";
import { mapAuditRow } from "./mappers";
import { getMockStore, mockClone } from "./mock-store";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";
import type { AuditLog } from "@/lib/types";

type AuditInput = {
  actorType?: string;
  actorName?: string;
  actorEmail?: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
};

export async function listAuditLogs(filter?: { entityType?: string; action?: string; entityId?: string }) {
  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    let query = supabase!
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (filter?.entityType) query = query.eq("entity_type", filter.entityType);
    if (filter?.action) query = query.eq("action", filter.action);
    if (filter?.entityId) query = query.eq("entity_id", filter.entityId);
    const { data, error } = await query;
    if (!error && data) return data.map(mapAuditRow);
  }

  let logs = getMockStore().auditLogs;
  if (filter?.entityType) logs = logs.filter((log) => log.entityType === filter.entityType);
  if (filter?.action) logs = logs.filter((log) => log.action === filter.action);
  if (filter?.entityId) logs = logs.filter((log) => log.entityId === filter.entityId);
  return mockClone(logs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createAuditLog(input: AuditInput) {
  const now = new Date().toISOString();
  const actorName = input.actorName ?? "System";
  let actorType = input.actorType ?? "system";
  let actorEmail = input.actorEmail ?? "";
  let actorId = input.actorId ?? null;

  if (getDataMode() === "Supabase Mode") {
    const supabase = await getSupabaseServerClient();
    const { data: userData } = await supabase!.auth.getUser();
    if (userData.user) {
      actorId = input.actorId ?? userData.user.id;
      actorEmail = input.actorEmail ?? userData.user.email ?? "";
      const { data: profile } = await supabase!
        .from("profiles")
        .select("full_name,role")
        .eq("id", userData.user.id)
        .maybeSingle();
      actorType = input.actorType ?? profile?.role ?? "authenticated";
    }
  }

  const audit: AuditLog = {
    id: randomUUID(),
    actor: actorName,
    actorType,
    actorName,
    actorEmail,
    actorId,
    action: input.action,
    entity: input.entityId,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    beforeData: input.beforeData ?? null,
    afterData: input.afterData ?? null,
    metadata: input.metadata ?? {},
    createdAt: now
  };

  if (getDataMode() === "Supabase Mode") {
    const admin = getSupabaseAdminClient();
    if (input.actorType === "system") {
      if (!admin) {
        throw new Error("Supabase server-only admin credentials are required for system audit logs.");
      }
      const { error: adminError } = await admin.from("audit_logs").insert({
        id: audit.id,
        actor: audit.actor,
        actor_type: audit.actorType,
        actor_name: audit.actorName,
        actor_email: audit.actorEmail,
        actor_id: audit.actorId,
        action: audit.action,
        entity_type: audit.entityType,
        entity_id: audit.entityId,
        summary: audit.summary,
        before_data: audit.beforeData,
        after_data: audit.afterData,
        metadata: audit.metadata,
        created_at: audit.createdAt
      });
      if (!adminError) return audit;
      throw new Error(`Audit log insert failed for ${audit.action}: ${adminError.message}`);
    }

    const supabase = await getSupabaseServerClient();
    const insertPayload = {
      id: audit.id,
      actor: audit.actor,
      actor_type: audit.actorType,
      actor_name: audit.actorName,
      actor_email: audit.actorEmail,
      actor_id: audit.actorId,
      action: audit.action,
      entity_type: audit.entityType,
      entity_id: audit.entityId,
      summary: audit.summary,
      before_data: audit.beforeData,
      after_data: audit.afterData,
      metadata: audit.metadata,
      created_at: audit.createdAt
    };
    const { error } = await supabase!.from("audit_logs").insert(insertPayload);
    if (!error) return audit;
    if (admin) {
      const { error: adminError } = await admin.from("audit_logs").insert(insertPayload);
      if (!adminError) return audit;
      throw new Error(`Audit log insert failed for ${audit.action}: ${adminError.message}`);
    }
    throw new Error(`Audit log insert failed for ${audit.action}: ${error.message}`);
  }

  getMockStore().auditLogs.unshift(audit);
  return mockClone(audit);
}
