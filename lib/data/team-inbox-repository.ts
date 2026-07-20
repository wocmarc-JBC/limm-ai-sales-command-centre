import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { CurrentProfile } from "@/lib/auth/session";
import { getDataMode } from "./data-source";
import { getSupabaseAdminClient } from "./supabase-admin";
import { getSupabaseServerClient } from "./supabase-server";
import {
  AI_QUALITY_VERSIONS,
  type AiQualityDecision,
  type InboxAssignment,
  type InboxInternalNote
} from "@/lib/operations/contracts";

type MockTeamState = {
  assignments: Map<string, InboxAssignment>;
  notes: InboxInternalNote[];
};

const globalTeamState = globalThis as typeof globalThis & { __limmMockTeamState?: MockTeamState };
const mockState = globalTeamState.__limmMockTeamState ??= {
  assignments: new Map<string, InboxAssignment>(),
  notes: [] as InboxInternalNote[]
};

function mapAssignment(row: Record<string, unknown>): InboxAssignment {
  return {
    leadId: String(row.lead_id ?? ""),
    assignedProfileId: row.assigned_profile_id ? String(row.assigned_profile_id) : null,
    assignedName: String(row.assigned_name ?? ""),
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
    leaseExpiresAt: row.lease_expires_at ? String(row.lease_expires_at) : null,
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    version: Number(row.version ?? 1)
  };
}

function mapNote(row: Record<string, unknown>): InboxInternalNote {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    body: String(row.body ?? ""),
    mentions: Array.isArray(row.mentions) ? row.mentions.map(String) : [],
    createdBy: String(row.created_by ?? ""),
    createdByName: String(row.created_by_name ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    editedAt: row.edited_at ? String(row.edited_at) : null
  };
}

export async function listInboxAssignments(leadIds: string[]) {
  if (!leadIds.length) return new Map<string, InboxAssignment>();
  if (getDataMode() === "Mock Mode") {
    return new Map(leadIds.flatMap((leadId) => {
      const assignment = mockState.assignments.get(leadId);
      return assignment ? [[leadId, assignment] as const] : [];
    }));
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) return new Map<string, InboxAssignment>();
  const { data, error } = await supabase.from("inbox_assignments").select("*").in("lead_id", leadIds);
  if (error) return new Map<string, InboxAssignment>();
  return new Map((data ?? []).map((row) => {
    const assignment = mapAssignment(row);
    return [assignment.leadId, assignment] as const;
  }));
}

export async function listInboxInternalNotes(leadId: string, limit = 30) {
  if (getDataMode() === "Mock Mode") {
    return mockState.notes.filter((note) => note.leadId === leadId).slice(-limit).reverse();
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("inbox_internal_notes")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)));
  return error ? [] : (data ?? []).map(mapNote);
}

export async function claimInboxConversation(leadId: string, actor: CurrentProfile) {
  if (getDataMode() === "Mock Mode") {
    const current = mockState.assignments.get(leadId);
    const now = new Date();
    if (current?.assignedProfileId !== actor.id && current?.leaseExpiresAt && Date.parse(current.leaseExpiresAt) > now.getTime()) {
      return { claimed: false, assignment: current, reason: "already_claimed" };
    }
    const assignment: InboxAssignment = {
      leadId,
      assignedProfileId: actor.id,
      assignedName: actor.fullName,
      claimedAt: current?.assignedProfileId === actor.id ? current.claimedAt : now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      updatedAt: now.toISOString(),
      version: (current?.version ?? 0) + 1
    };
    mockState.assignments.set(leadId, assignment);
    return { claimed: true, assignment, reason: "claimed" };
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { claimed: false, assignment: null, reason: "database_unavailable" };
  const { data, error } = await supabase.rpc("claim_inbox_conversation", { p_lead_id: leadId, p_lease_minutes: 30 });
  if (error) return { claimed: false, assignment: null, reason: error.code || "claim_failed" };
  const row = Array.isArray(data) ? data[0] : data;
  return row ? {
    claimed: Boolean(row.claimed),
    assignment: mapAssignment({ lead_id: leadId, ...row, updated_at: new Date().toISOString() }),
    reason: row.claimed ? "claimed" : "already_claimed"
  } : { claimed: false, assignment: null, reason: "claim_failed" };
}

export async function releaseInboxConversation(leadId: string, actor: CurrentProfile) {
  if (getDataMode() === "Mock Mode") {
    const current = mockState.assignments.get(leadId);
    if (!current) return { released: true, reason: "already_unassigned" };
    if (current.assignedProfileId !== actor.id && !["boss", "admin"].includes(actor.role)) {
      return { released: false, reason: "not_owner" };
    }
    mockState.assignments.delete(leadId);
    return { released: true, reason: "released" };
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { released: false, reason: "database_unavailable" };
  const { data, error } = await supabase.rpc("release_inbox_conversation", { p_lead_id: leadId });
  return error
    ? { released: false, reason: error.code || "release_failed" }
    : { released: data === true, reason: data === true ? "released" : "not_owner" };
}

export async function addInboxInternalNote(input: {
  leadId: string;
  body: string;
  mentions: string[];
  actor: CurrentProfile;
}) {
  if (getDataMode() === "Mock Mode") {
    const note: InboxInternalNote = {
      id: randomUUID(),
      leadId: input.leadId,
      body: input.body,
      mentions: input.mentions,
      createdBy: input.actor.id,
      createdByName: input.actor.fullName,
      createdAt: new Date().toISOString(),
      editedAt: null
    };
    mockState.notes.push(note);
    return note;
  }
  const supabase = await getSupabaseServerClient();
  if (!supabase) throw new Error("database_unavailable");
  const { data, error } = await supabase.from("inbox_internal_notes").insert({
    lead_id: input.leadId,
    body: input.body,
    mentions: input.mentions,
    created_by: input.actor.id,
    created_by_name: input.actor.fullName
  }).select("*").single();
  if (error) throw new Error(error.code || "note_failed");
  return mapNote(data);
}

export async function getInboxTeamState(leadId: string) {
  const [assignments, notes] = await Promise.all([
    listInboxAssignments([leadId]),
    listInboxInternalNotes(leadId)
  ]);
  return { assignment: assignments.get(leadId) ?? null, notes };
}

export async function recordOperatorProductEvent(input: {
  eventName: string;
  actorId?: string | null;
  leadId?: string | null;
  sessionId?: string;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}) {
  if (getDataMode() === "Mock Mode") return false;
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("operator_product_events").insert({
    event_name: input.eventName,
    actor_id: input.actorId || null,
    lead_id: input.leadId || null,
    session_id: (input.sessionId || "").slice(0, 120),
    duration_ms: typeof input.durationMs === "number" ? Math.max(0, Math.round(input.durationMs)) : null,
    metadata: input.metadata ?? {}
  });
  return !error;
}

export async function recordAiQualityObservation(input: {
  leadId?: string | null;
  messageId?: string | null;
  traceId?: string;
  reply: string;
  primaryMove?: string;
  qualityScores: Record<string, number | boolean | string>;
  shadowCandidate?: boolean;
  decision?: AiQualityDecision;
  feedback?: string;
  reviewedBy?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (getDataMode() === "Mock Mode") return null;
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const replySignature = input.reply
    ? createHash("sha256").update(input.reply.trim().replace(/\s+/g, " ").toLowerCase()).digest("hex")
    : "";
  const { data, error } = await admin.from("ai_reply_quality_events").insert({
    lead_id: input.leadId || null,
    message_id: input.messageId && /^[0-9a-f-]{36}$/i.test(input.messageId) ? input.messageId : null,
    trace_id: (input.traceId || "").slice(0, 128),
    model_version: AI_QUALITY_VERSIONS.model,
    prompt_version: AI_QUALITY_VERSIONS.prompt,
    planner_version: AI_QUALITY_VERSIONS.planner,
    reply_signature: replySignature,
    primary_move: (input.primaryMove || "").slice(0, 160),
    quality_scores: input.qualityScores,
    shadow_candidate: Boolean(input.shadowCandidate),
    decision: input.decision || "observed",
    operator_feedback: (input.feedback || "").slice(0, 500),
    metadata: input.metadata ?? {},
    reviewed_at: input.reviewedBy ? new Date().toISOString() : null,
    reviewed_by: input.reviewedBy || null
  }).select("id").maybeSingle();
  return error || !data?.id ? null : String(data.id);
}

export async function linkAiQualityObservationsToMessage(input: {
  qualityEventIds: Array<string | null | undefined>;
  messageId: string;
}) {
  const ids = input.qualityEventIds.filter((id): id is string => Boolean(id && /^[0-9a-f-]{36}$/i.test(id)));
  if (!ids.length || !/^[0-9a-f-]{36}$/i.test(input.messageId) || getDataMode() === "Mock Mode") return false;
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin
    .from("ai_reply_quality_events")
    .update({ message_id: input.messageId })
    .in("id", ids);
  return !error;
}

function levenshteinDistance(left: string, right: string) {
  const a = Array.from(left);
  const b = Array.from(right);
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

export async function reviewAiQualityObservation(input: {
  leadId: string;
  messageId: string;
  qualityEventId?: string;
  decision: Exclude<AiQualityDecision, "observed" | "unsafe">;
  feedback?: string;
  editedReply?: string;
  reviewedBy: string;
}) {
  if (getDataMode() === "Mock Mode") return { updated: true, reason: "mock_recorded" };
  const admin = getSupabaseAdminClient();
  if (!admin) return { updated: false, reason: "database_unavailable" };

  let query = admin
    .from("ai_reply_quality_events")
    .select("id,message_id,metadata")
    .eq("lead_id", input.leadId)
    .eq("shadow_candidate", false);
  if (input.qualityEventId && /^[0-9a-f-]{36}$/i.test(input.qualityEventId)) {
    query = query.eq("id", input.qualityEventId);
  } else {
    query = query.eq("message_id", input.messageId);
  }
  const { data: qualityRows, error: qualityLookupError } = await query
    .order("created_at", { ascending: false })
    .limit(1);
  if (qualityLookupError) return { updated: false, reason: qualityLookupError.code || "quality_lookup_failed" };
  const qualityEvent = qualityRows?.[0];
  if (!qualityEvent?.id) return { updated: false, reason: "quality_observation_not_found" };
  if (String(qualityEvent.message_id ?? "") !== input.messageId) {
    return { updated: false, reason: "quality_observation_message_mismatch" };
  }

  let editDistance: number | null = null;
  if (input.decision === "edited") {
    const { data: message } = await admin
      .from("lead_messages")
      .select("body")
      .eq("id", input.messageId)
      .eq("lead_id", input.leadId)
      .maybeSingle();
    editDistance = levenshteinDistance(String(message?.body ?? ""), String(input.editedReply ?? ""));
  }

  const metadata = qualityEvent.metadata && typeof qualityEvent.metadata === "object"
    ? qualityEvent.metadata as Record<string, unknown>
    : {};
  const operatorFeedback = input.decision === "edited"
    ? String(input.editedReply ?? "").trim()
    : String(input.feedback ?? "").trim();
  const { error } = await admin
    .from("ai_reply_quality_events")
    .update({
      decision: input.decision,
      operator_feedback: operatorFeedback.slice(0, 500),
      edit_distance: editDistance,
      reviewed_at: new Date().toISOString(),
      reviewed_by: input.reviewedBy,
      metadata: { ...metadata, operatorReviewSource: "inbox", operatorReviewDecision: input.decision }
    })
    .eq("id", qualityEvent.id);
  return error
    ? { updated: false, reason: error.code || "quality_update_failed" }
    : { updated: true, reason: "quality_observation_reviewed" };
}
