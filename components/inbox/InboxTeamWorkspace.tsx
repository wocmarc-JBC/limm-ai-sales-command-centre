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
  latestAiReply,
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
  latestAiReply?: { messageId: string; qualityEventId: string; body: string };
  onEnableNotifications: () => Promise<NotificationPermission>;
  onAssignmentChange: (assignment: InboxAssignment | null) => void;
}) {
  const [state, setState] = useState<TeamState>({ assignment: initialAssignment, notes: [] });
  const [notesOpen, setNotesOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState("");
  const [qualityDecision, setQualityDecision] = useState<AiQualityDecision | "">("");
  const [qualityMode, setQualityMode] = useState<"rejected" | "edited" | "">("");
  const [qualityText, setQualityText] = useState("");

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
    setQualityMode("");
    setQualityText("");
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
      setNotice(action === "claim" ? "Conversation assigned to you. Bot state unchanged." : "Conversation released to the team queue. Bot state unchanged.");
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

  const submitQuality = async (decision: "accepted" | "edited" | "rejected") => {
    if (!latestAiReply || pending) return;
    setPending("quality");
    try {
      const response = await fetch(`/api/inbox/team/${encodeURIComponent(leadId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "quality_feedback",
          decision,
          messageId: latestAiReply.messageId,
          qualityEventId: latestAiReply.qualityEventId,
          feedback: decision === "rejected" ? qualityText : "",
          editedReply: decision === "edited" ? qualityText : ""
        })
      });
      if (response.ok) {
        setQualityDecision(decision);
        setQualityMode("");
        setQualityText("");
        setNotice("AI reply review saved for Marcus's learning loop. Nothing was sent to the client.");
      } else {
        const data = await response.json().catch(() => ({}));
        setNotice(data?.error === "quality_observation_not_found"
          ? "This older reply predates linked learning records. Review a newer AI reply instead."
          : "Quality feedback could not be recorded.");
      }
    } finally {
      setPending("");
    }
  };

  return (
    <section className="shrink-0 border-b border-command-line bg-command-panel2/85" data-testid="inbox-team-workspace">
      <div className="flex min-h-10 flex-nowrap items-center gap-1.5 px-3 py-1.5 sm:min-h-11 sm:flex-wrap sm:gap-2 sm:px-4 sm:py-2">
        <span className={`h-2 w-2 rounded-full ${realtimeStatus === "live" ? "bg-command-green" : realtimeStatus === "recovering" ? "bg-command-amber" : "bg-command-subtle"}`} aria-hidden="true" />
        <span className="hidden text-[11px] font-semibold text-command-muted sm:inline">
          {realtimeStatus === "live" ? "Realtime team" : realtimeStatus === "recovering" ? "Polling fallback" : realtimeStatus === "connecting" ? "Connecting team" : "Local team mode"}
        </span>
        <span className="hidden text-command-line sm:inline" aria-hidden="true">·</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-command-muted sm:flex-none sm:text-xs">
          {activeAssignment ? (mine ? "Owned by you" : `Owned by ${activeAssignment.assignedName}`) : "Unassigned team queue"}
        </span>
        {viewers.length ? (
          <span className="rounded-full border border-command-amber/35 bg-command-amber/10 px-2 py-0.5 text-[10px] font-semibold text-command-amber" role="status">
            {viewers.map((member) => member.fullName).join(", ")} viewing
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {notificationsSupported && notificationPermission !== "granted" ? (
            <button type="button" onClick={() => void onEnableNotifications()} className="hidden rounded-lg px-2 py-1.5 text-[11px] font-semibold text-command-muted transition hover:bg-command-bg hover:text-command-text sm:inline-flex">
              Enable alerts
            </button>
          ) : null}
          <span className="hidden text-[10px] font-medium text-command-subtle 2xl:inline">Assignment only · does not pause bot</span>
          {!activeAssignment || mine ? (
            <button
              type="button"
              disabled={Boolean(pending)}
              onClick={() => void mutate(mine ? "release" : "claim")}
              title={mine ? "Release this conversation to the team queue. Bot state is unchanged." : "Assign this conversation to yourself for 30 minutes. This does not pause the bot."}
              className={`min-h-8 rounded-lg border px-2 py-1 text-[10px] font-semibold transition disabled:opacity-50 sm:px-2.5 sm:py-1.5 sm:text-[11px] ${mine ? "border-command-line text-command-muted hover:text-command-text" : "border-command-gold/45 bg-command-gold/10 text-command-gold hover:bg-command-gold/15"}`}
            >
              {pending === "claim" ? "Assigning…" : pending === "release" ? "Releasing…" : mine ? "Release" : <><span className="sm:hidden">Assign</span><span className="hidden sm:inline">Assign to me</span></>}
            </button>
          ) : null}
          <button type="button" onClick={() => setNotesOpen((open) => !open)} aria-expanded={notesOpen} className="min-h-8 rounded-lg border border-command-line px-2 py-1 text-[10px] font-semibold text-command-muted transition hover:border-command-gold/40 hover:text-command-text sm:px-2.5 sm:py-1.5 sm:text-[11px]">
            Notes {state.notes.length ? `(${state.notes.length})` : ""}
          </button>
          {latestAiReply && ["boss", "admin"].includes(operator.role) ? (
            <button type="button" onClick={() => setQualityOpen((open) => !open)} aria-expanded={qualityOpen} className="min-h-8 rounded-lg border border-command-cyan/35 bg-command-cyan/5 px-2 py-1 text-[10px] font-semibold text-command-cyan transition hover:bg-command-cyan/10 sm:px-2.5 sm:py-1.5 sm:text-[11px]">
              Review AI
            </button>
          ) : null}
        </div>
      </div>

      {notice ? <p className="border-t border-command-line/50 px-4 py-1.5 text-[11px] text-command-cyan" role="status">{notice}</p> : null}

      {qualityOpen && latestAiReply ? (
        <div className="border-t border-command-line px-3 py-3 sm:px-4" data-testid="inbox-ai-reply-review">
          <div className="rounded-xl border border-command-cyan/25 bg-command-bg/55 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-auto">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-command-cyan">Marcus AI review</p>
                <p className="mt-1 text-xs text-command-muted">Rate the latest AI reply. This trains the review dataset; it never messages the client.</p>
              </div>
              <button type="button" disabled={Boolean(pending)} onClick={() => void submitQuality("accepted")} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${qualityDecision === "accepted" ? "border-command-green bg-command-green/10 text-command-green" : "border-command-line text-command-muted hover:border-command-green/50 hover:text-command-green"}`}>Good</button>
              <button type="button" disabled={Boolean(pending)} onClick={() => { setQualityMode("rejected"); setQualityText(""); }} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${qualityDecision === "rejected" || qualityMode === "rejected" ? "border-command-red bg-command-red/10 text-command-red" : "border-command-line text-command-muted hover:border-command-red/50 hover:text-command-red"}`}>Wrong</button>
              <button type="button" disabled={Boolean(pending)} onClick={() => { setQualityMode("edited"); setQualityText(latestAiReply.body); }} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${qualityDecision === "edited" || qualityMode === "edited" ? "border-command-gold bg-command-gold/10 text-command-gold" : "border-command-line text-command-muted hover:border-command-gold/50 hover:text-command-gold"}`}>Edited</button>
            </div>
            {qualityMode ? (
              <div className="mt-3">
                <label className="text-xs font-semibold text-command-muted" htmlFor="ai_quality_feedback">
                  {qualityMode === "edited" ? "Corrected reply" : "What was wrong? (optional)"}
                </label>
                <textarea id="ai_quality_feedback" value={qualityText} onChange={(event) => setQualityText(event.target.value)} maxLength={500} rows={3} className="mt-1.5 w-full rounded-xl border border-command-line bg-command-bg px-3 py-2 text-sm text-command-text outline-none focus:border-command-gold/60" />
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => { setQualityMode(""); setQualityText(""); }} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-command-muted">Cancel</button>
                  <button type="button" disabled={Boolean(pending) || (qualityMode === "edited" && !qualityText.trim())} onClick={() => void submitQuality(qualityMode)} className="rounded-lg bg-command-gold px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40">{pending === "quality" ? "Saving…" : "Save review"}</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {notesOpen ? (
        <div className="border-t border-command-line px-3 py-3 sm:px-4">
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
        </div>
      ) : null}
    </section>
  );
}
