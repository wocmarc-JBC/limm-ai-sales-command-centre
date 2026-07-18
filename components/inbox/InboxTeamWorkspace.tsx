"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  AiQualityDecision,
  InboxAssignment,
  InboxInternalNote,
  InboxOperator,
  InboxPresenceMember
} from "@/lib/operations/contracts";

type TeamState = { assignment: InboxAssignment | null; notes: InboxInternalNote[] };

function assignmentActive(assignment: InboxAssignment | null) {
  return Boolean(assignment?.assignedProfileId && assignment.leaseExpiresAt && Date.parse(assignment.leaseExpiresAt) > Date.now());
}

function noteTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-SG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function mentionsFrom(body: string) {
  return Array.from(body.matchAll(/@([A-Za-z][A-Za-z0-9 .'-]{1,60})/g)).map((match) => match[1].trim()).slice(0, 12);
}

export function InboxTeamWorkspace({
  leadId,
  operator,
  initialAssignment,
  presenceMembers,
  realtimeStatus,
  realtimeRevision,
  notificationPermission,
  notificationsSupported,
  latestOutboundMessageId,
  onEnableNotifications,
  onAssignmentChange
}: {
  leadId: string;
  operator: InboxOperator;
  initialAssignment: InboxAssignment | null;
  presenceMembers: InboxPresenceMember[];
  realtimeStatus: "connecting" | "live" | "recovering" | "disabled";
  realtimeRevision: number;
  notificationPermission: NotificationPermission;
  notificationsSupported: boolean;
  latestOutboundMessageId?: string;
  onEnableNotifications: () => Promise<NotificationPermission>;
  onAssignmentChange: (assignment: InboxAssignment | null) => void;
}) {
  const [state, setState] = useState<TeamState>({ assignment: initialAssignment, notes: [] });
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState("");
  const [qualityDecision, setQualityDecision] = useState<AiQualityDecision | "">("");

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/inbox/team/${encodeURIComponent(leadId)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!data?.ok) return;
    const next = { assignment: data.assignment ?? null, notes: Array.isArray(data.notes) ? data.notes : [] } as TeamState;
    setState(next);
    onAssignmentChange(next.assignment);
  }, [leadId, onAssignmentChange]);

  useEffect(() => {
    setState((current) => ({ assignment: current.assignment?.leadId === leadId ? current.assignment : null, notes: [] }));
    setNotice("");
    setQualityDecision("");
    void refresh();
  }, [leadId, refresh]);

  useEffect(() => {
    if (realtimeRevision > 0) void refresh();
  }, [realtimeRevision, refresh]);

  const activeAssignment = assignmentActive(state.assignment) ? state.assignment : null;
  const mine = activeAssignment?.assignedProfileId === operator.id;
  const viewers = useMemo(() => presenceMembers.filter((member) => member.activeLeadId === leadId && member.profileId !== operator.id), [leadId, operator.id, presenceMembers]);

  const mutate = async (action: "claim" | "release") => {
    setPending(action);
    setNotice("");
    try {
      const response = await fetch(`/api/inbox/team/${encodeURIComponent(leadId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setNotice(data?.reason === "already_claimed" && data?.assignment?.assignedName
          ? `${data.assignment.assignedName} already owns this conversation.`
          : "Team assignment could not be updated.");
        if (data?.assignment) {
          setState((current) => ({ ...current, assignment: data.assignment }));
          onAssignmentChange(data.assignment);
        }
        return;
      }
      await refresh();
      setNotice(action === "claim" ? "Conversation claimed." : "Conversation released to the team queue.");
    } finally {
      setPending("");
    }
  };

  const submitNote = async (event: FormEvent) => {
    event.preventDefault();
    const body = noteBody.trim();
    if (!body || pending) return;
    setPending("note");
    try {
      const response = await fetch(`/api/inbox/team/${encodeURIComponent(leadId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "note", body, mentions: mentionsFrom(body) })
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.ok) {
        setNoteBody("");
        setState((current) => ({ ...current, notes: [data.note, ...current.notes] }));
        setNotice("Internal note added. It was not sent to WhatsApp.");
      } else setNotice("Internal note could not be saved.");
    } finally {
      setPending("");
    }
  };

  const submitQuality = async (decision: AiQualityDecision) => {
    if (!latestOutboundMessageId || pending) return;
    setPending("quality");
    try {
      const response = await fetch(`/api/inbox/team/${encodeURIComponent(leadId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "quality_feedback", decision, messageId: latestOutboundMessageId })
      });
      if (response.ok) {
        setQualityDecision(decision);
        setNotice("Reply outcome recorded for the quality release gate.");
      } else setNotice("Quality feedback could not be recorded.");
    } finally {
      setPending("");
    }
  };

  return (
    <section className="shrink-0 border-b border-command-line bg-command-panel2/85" data-testid="inbox-team-workspace">
      <div className="flex min-h-11 flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
        <span className={`h-2 w-2 rounded-full ${realtimeStatus === "live" ? "bg-command-green" : realtimeStatus === "recovering" ? "bg-command-amber" : "bg-command-subtle"}`} aria-hidden="true" />
        <span className="text-[11px] font-semibold text-command-muted">
          {realtimeStatus === "live" ? "Realtime team" : realtimeStatus === "recovering" ? "Polling fallback" : realtimeStatus === "connecting" ? "Connecting team" : "Local team mode"}
        </span>
        <span className="text-command-line" aria-hidden="true">·</span>
        <span className="min-w-0 truncate text-xs text-command-muted">
          {activeAssignment ? (mine ? "Owned by you" : `Owned by ${activeAssignment.assignedName}`) : "Unassigned team queue"}
        </span>
        {viewers.length ? (
          <span className="rounded-full border border-command-amber/35 bg-command-amber/10 px-2 py-0.5 text-[10px] font-semibold text-command-amber" role="status">
            {viewers.map((member) => member.fullName).join(", ")} viewing
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          {notificationsSupported && notificationPermission !== "granted" ? (
            <button type="button" onClick={() => void onEnableNotifications()} className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-command-muted transition hover:bg-command-bg hover:text-command-text">
              Enable alerts
            </button>
          ) : null}
          {!activeAssignment || mine ? (
            <button
              type="button"
              disabled={Boolean(pending)}
              onClick={() => void mutate(mine ? "release" : "claim")}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 ${mine ? "border-command-line text-command-muted hover:text-command-text" : "border-command-gold/45 bg-command-gold/10 text-command-gold hover:bg-command-gold/15"}`}
            >
              {pending === "claim" ? "Claiming…" : pending === "release" ? "Releasing…" : mine ? "Release" : "Claim chat"}
            </button>
          ) : null}
          <button type="button" onClick={() => setNotesOpen((open) => !open)} aria-expanded={notesOpen} className="rounded-lg border border-command-line px-2.5 py-1.5 text-[11px] font-semibold text-command-muted transition hover:border-command-gold/40 hover:text-command-text">
            Notes {state.notes.length ? `(${state.notes.length})` : ""}
          </button>
        </div>
      </div>

      {notice ? <p className="border-t border-command-line/50 px-4 py-1.5 text-[11px] text-command-cyan" role="status">{notice}</p> : null}

      {notesOpen ? (
        <div className="grid gap-3 border-t border-command-line px-3 py-3 sm:px-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div>
            <form onSubmit={submitNote} className="flex gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Internal team note</span>
                <input value={noteBody} onChange={(event) => setNoteBody(event.target.value)} maxLength={2000} placeholder="Internal note — use @name to mention…" className="w-full rounded-xl border border-command-line bg-command-bg px-3 py-2 text-sm text-command-text outline-none focus:border-command-gold/60" />
              </label>
              <button type="submit" disabled={!noteBody.trim() || Boolean(pending)} className="rounded-xl bg-command-gold px-3 py-2 text-xs font-semibold text-black disabled:opacity-40">Add note</button>
            </form>
            <p className="mt-1 text-[10px] text-command-subtle">Internal only. Never included in a WhatsApp reply.</p>
            <div className="mt-2 max-h-32 space-y-1.5 overflow-y-auto">
              {state.notes.map((note) => (
                <div key={note.id} className="rounded-lg border border-command-line/70 bg-command-bg/60 px-3 py-2 text-xs">
                  <p className="text-command-text">{note.body}</p>
                  <p className="mt-1 text-[10px] text-command-subtle">{note.createdByName} · {noteTime(note.createdAt)}</p>
                </div>
              ))}
              {!state.notes.length ? <p className="text-xs text-command-subtle">No internal notes yet.</p> : null}
            </div>
          </div>
          <div className="rounded-xl border border-command-line bg-command-bg/55 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-command-cyan">Reply quality</p>
            <p className="mt-1 text-xs text-command-muted">How did the latest sent reply perform?</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["accepted", "edited", "rejected", "unsafe"] as const).map((decision) => (
                <button key={decision} type="button" disabled={!latestOutboundMessageId || Boolean(pending)} onClick={() => void submitQuality(decision)} className={`rounded-lg border px-2 py-1 text-[10px] font-semibold capitalize transition disabled:opacity-35 ${qualityDecision === decision ? "border-command-cyan bg-command-cyan/10 text-command-cyan" : "border-command-line text-command-muted hover:text-command-text"}`}>
                  {decision}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
