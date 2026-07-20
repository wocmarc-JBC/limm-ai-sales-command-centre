"use client";

import { useEffect } from "react";
import { InboxTeamWorkspace } from "@/components/inbox/InboxTeamWorkspace";
import { useInboxRealtime, type RealtimeStatus } from "@/components/inbox/useInboxRealtime";
import type { InboxAssignment, InboxOperator } from "@/lib/operations/contracts";

export function InboxCollaborationLayer({
  leadId,
  operator,
  realtimeEnabled,
  initialAssignment,
  realtimeRevision,
  latestAiReply,
  onActivity,
  onStatusChange,
  onAssignmentChange
}: {
  leadId: string;
  operator: InboxOperator;
  realtimeEnabled: boolean;
  initialAssignment: InboxAssignment | null;
  realtimeRevision: number;
  latestAiReply?: { messageId: string; qualityEventId: string; body: string };
  onActivity: (activity: { leadId?: string }) => void;
  onStatusChange: (status: RealtimeStatus) => void;
  onAssignmentChange: (assignment: InboxAssignment | null) => void;
}) {
  const realtime = useInboxRealtime({
    enabled: realtimeEnabled,
    operator,
    activeLeadId: leadId,
    onActivity
  });

  useEffect(() => {
    onStatusChange(realtime.status);
  }, [onStatusChange, realtime.status]);

  return (
    <InboxTeamWorkspace
      key={leadId}
      leadId={leadId}
      operator={operator}
      initialAssignment={initialAssignment}
      presenceMembers={realtime.members}
      realtimeStatus={realtime.status}
      realtimeRevision={realtimeRevision}
      notificationPermission={realtime.notificationPermission}
      notificationsSupported={realtime.notificationsSupported}
      latestAiReply={latestAiReply}
      onEnableNotifications={realtime.enableNotifications}
      onAssignmentChange={onAssignmentChange}
    />
  );
}
