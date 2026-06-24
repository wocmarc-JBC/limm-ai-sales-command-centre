import type { Lead, LeadMessage } from "@/lib/types";

export type InboxPrimaryStatus =
  | "Failed send"
  | "Waiting for Marcus"
  | "Waiting for client"
  | "New lead"
  | "Bot active"
  | "Human takeover"
  | "Closed / Done";

export type InboxQueueState = {
  primaryStatus: InboxPrimaryStatus;
  unreadCount: number;
  failedSend: boolean;
  waitingForClient: boolean;
  waitingForMarcus: boolean;
  closedOrDone: boolean;
  latestMessageDirection: LeadMessage["direction"] | "";
};

function messageTime(message: LeadMessage) {
  const value = new Date(message.createdAt).getTime();
  return Number.isNaN(value) ? 0 : value;
}

export function latestMeaningfulWhatsAppMessage(messages: LeadMessage[]) {
  return [...messages]
    .filter((message) => (
      message.channel === "whatsapp" &&
      (message.direction === "inbound" || message.direction === "outbound") &&
      Boolean(message.body?.trim() || message.providerMessageId || message.whatsappStatus)
    ))
    .sort((a, b) => messageTime(b) - messageTime(a))[0] ?? null;
}

export function hasRealFailedWhatsAppSend(messages: LeadMessage[]) {
  return messages.some((message) => (
    message.channel === "whatsapp" &&
    message.direction === "outbound" &&
    message.whatsappStatus === "failed" &&
    !message.providerMessageId &&
    !/NEXT_REDIRECT/i.test(typeof message.metadata?.error === "string" ? message.metadata.error : "")
  ));
}

export function countUnreadWhatsAppMessages(lead: Lead, messages: LeadMessage[]) {
  const lastReplyAt = lead.lastReplyAt ? new Date(lead.lastReplyAt).getTime() : 0;
  return messages.filter((message) => (
    message.channel === "whatsapp" &&
    message.direction === "inbound" &&
    new Date(message.createdAt).getTime() > lastReplyAt
  )).length;
}

export function isClosedOrDoneLead(lead: Lead) {
  return Boolean(
    lead.deletedAt ||
    lead.archivedAt ||
    lead.status === "Not Suitable" ||
    lead.salesStage === "Won" ||
    lead.salesStage === "Lost" ||
    lead.salesStage === "Archived"
  );
}

export function getInboxQueueState(lead: Lead, messages: LeadMessage[]): InboxQueueState {
  const latestMessage = latestMeaningfulWhatsAppMessage(messages);
  const unreadCount = countUnreadWhatsAppMessages(lead, messages);
  const failedSend = hasRealFailedWhatsAppSend(messages);
  const closedOrDone = isClosedOrDoneLead(lead);

  if (failedSend) {
    return {
      primaryStatus: "Failed send",
      unreadCount,
      failedSend,
      waitingForClient: false,
      waitingForMarcus: true,
      closedOrDone,
      latestMessageDirection: latestMessage?.direction ?? ""
    };
  }

  if (closedOrDone) {
    return {
      primaryStatus: "Closed / Done",
      unreadCount,
      failedSend,
      waitingForClient: false,
      waitingForMarcus: false,
      closedOrDone,
      latestMessageDirection: latestMessage?.direction ?? ""
    };
  }

  if (latestMessage?.direction === "inbound") {
    return {
      primaryStatus: "Waiting for Marcus",
      unreadCount: Math.max(unreadCount, 1),
      failedSend,
      waitingForClient: false,
      waitingForMarcus: true,
      closedOrDone,
      latestMessageDirection: "inbound"
    };
  }

  if (latestMessage?.direction === "outbound") {
    const manualOutbound = latestMessage.metadata?.manualReply === true || Boolean(lead.botPaused);
    return {
      primaryStatus: manualOutbound ? "Waiting for client" : "Bot active",
      unreadCount,
      failedSend,
      waitingForClient: manualOutbound,
      waitingForMarcus: false,
      closedOrDone,
      latestMessageDirection: "outbound"
    };
  }

  if (lead.status === "New Enquiry") {
    return {
      primaryStatus: "New lead",
      unreadCount,
      failedSend,
      waitingForClient: false,
      waitingForMarcus: false,
      closedOrDone,
      latestMessageDirection: ""
    };
  }

  if (lead.needsMarcus || lead.bossApprovalNeeded) {
    return {
      primaryStatus: "Waiting for Marcus",
      unreadCount,
      failedSend,
      waitingForClient: false,
      waitingForMarcus: true,
      closedOrDone,
      latestMessageDirection: ""
    };
  }

  if (lead.status === "Awaiting Client") {
    return {
      primaryStatus: "Waiting for client",
      unreadCount,
      failedSend,
      waitingForClient: true,
      waitingForMarcus: false,
      closedOrDone,
      latestMessageDirection: ""
    };
  }

  if (lead.botPaused) {
    return {
      primaryStatus: "Human takeover",
      unreadCount,
      failedSend,
      waitingForClient: false,
      waitingForMarcus: false,
      closedOrDone,
      latestMessageDirection: ""
    };
  }

  return {
    primaryStatus: "Bot active",
    unreadCount,
    failedSend,
    waitingForClient: false,
    waitingForMarcus: false,
    closedOrDone,
    latestMessageDirection: latestMessage?.direction ?? ""
  };
}

export function inboxQueuePriority(state: Pick<InboxQueueState, "primaryStatus">) {
  if (state.primaryStatus === "Failed send") return 0;
  if (state.primaryStatus === "Waiting for Marcus") return 1;
  if (state.primaryStatus === "New lead") return 2;
  if (state.primaryStatus === "Bot active") return 3;
  if (state.primaryStatus === "Waiting for client") return 4;
  if (state.primaryStatus === "Human takeover") return 5;
  return 6;
}
