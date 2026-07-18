"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/data/supabase-browser";
import type { InboxOperator, InboxPresenceMember } from "@/lib/operations/contracts";
import { trackOperatorEvent } from "@/lib/operator-product-analytics";

export type RealtimeStatus = "connecting" | "live" | "recovering" | "disabled";

type InboxActivity = {
  entity?: string;
  operation?: string;
  leadId?: string;
  occurredAt?: string;
};

export function useInboxRealtime(input: {
  enabled: boolean;
  operator: InboxOperator;
  activeLeadId: string;
  onActivity: (activity: InboxActivity) => void;
}) {
  const [status, setStatus] = useState<RealtimeStatus>(input.enabled ? "connecting" : "disabled");
  const [members, setMembers] = useState<InboxPresenceMember[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => (
    typeof Notification === "undefined" ? "denied" : Notification.permission
  ));
  const activeLeadRef = useRef(input.activeLeadId);
  const activityCallbackRef = useRef(input.onActivity);
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null>(null);

  useEffect(() => { activeLeadRef.current = input.activeLeadId; }, [input.activeLeadId]);
  useEffect(() => { activityCallbackRef.current = input.onActivity; }, [input.onActivity]);

  const showBackgroundNotification = useCallback((activity: InboxActivity) => {
    if (typeof document === "undefined" || !document.hidden || Notification.permission !== "granted") return;
    if (!activity.leadId || activity.leadId === activeLeadRef.current) return;
    const leadId = activity.leadId;
    navigator.serviceWorker?.ready.then((registration) => registration.showNotification("LIMM inbox activity", {
      body: "A conversation needs a fresh look.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: `limm-inbox-${leadId}`,
      data: { url: `/inbox?lead=${encodeURIComponent(leadId)}` }
    })).catch(() => null);
  }, []);

  useEffect(() => {
    if (!input.enabled) {
      setStatus("disabled");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel("inbox:team:activity", {
      config: { private: true, presence: { key: input.operator.id } }
    });
    channelRef.current = channel;
    let active = true;

    channel
      .on("broadcast", { event: "inbox_activity" }, ({ payload }) => {
        const activity = (payload ?? {}) as InboxActivity;
        activityCallbackRef.current(activity);
        showBackgroundNotification(activity);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<InboxPresenceMember>();
        const next = Object.values(state).flat().flatMap((member) => member?.profileId ? [{
          profileId: member.profileId,
          fullName: member.fullName,
          role: member.role,
          activeLeadId: member.activeLeadId,
          onlineAt: member.onlineAt
        } as InboxPresenceMember] : []);
        if (active) setMembers(next);
      });

    channel.subscribe(async (nextStatus) => {
      if (!active) return;
      if (nextStatus === "SUBSCRIBED") {
        setStatus((current) => {
          if (current === "recovering") trackOperatorEvent({ eventName: "realtime_recovered", metadata: { realtimeStatus: "live" } });
          return "live";
        });
        await channel.track({
          profileId: input.operator.id,
          fullName: input.operator.fullName,
          role: input.operator.role,
          activeLeadId: activeLeadRef.current,
          onlineAt: new Date().toISOString()
        });
      } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(nextStatus)) {
        setStatus("recovering");
      }
    });

    return () => {
      active = false;
      channelRef.current = null;
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [input.enabled, input.operator.fullName, input.operator.id, input.operator.role, showBackgroundNotification]);

  useEffect(() => {
    if (status !== "live" || !channelRef.current) return;
    void channelRef.current.track({
      profileId: input.operator.id,
      fullName: input.operator.fullName,
      role: input.operator.role,
      activeLeadId: input.activeLeadId,
      onlineAt: new Date().toISOString()
    });
  }, [input.activeLeadId, input.operator.fullName, input.operator.id, input.operator.role, status]);

  const enableNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") return "denied" as const;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") trackOperatorEvent({ eventName: "notification_enabled" });
    return permission;
  }, []);

  return {
    status,
    members,
    notificationPermission,
    notificationsSupported: typeof Notification !== "undefined" && typeof navigator !== "undefined" && "serviceWorker" in navigator,
    enableNotifications
  };
}
