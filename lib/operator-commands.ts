export const OPERATOR_COMMAND_EVENT = "limm:operator-command";

export type OperatorCommand =
  | "focus_inbox_reply"
  | "open_inbox_details"
  | "next_waiting_chat"
  | "review_inbox_automation"
  | "remove_inbox_spam"
  | "open_active_lead";
