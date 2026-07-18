import type { ReactNode } from "react";

export type AppIconName =
  | "today"
  | "command"
  | "inbox"
  | "followups"
  | "appointments"
  | "pipeline"
  | "leads"
  | "review"
  | "quotations"
  | "approval"
  | "delivery"
  | "files"
  | "money"
  | "targets"
  | "reports"
  | "settings"
  | "hygiene"
  | "install"
  | "audit"
  | "search"
  | "chevron";

type AppIconProps = {
  name: AppIconName;
  className?: string;
};

const paths: Record<AppIconName, ReactNode> = {
  today: <><path d="M4 13h6V4H4v9Z" /><path d="M14 20h6v-9h-6v9Z" /><path d="M14 7h6V4h-6v3Z" /><path d="M4 20h6v-3H4v3Z" /></>,
  command: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
  inbox: <><path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9Z" /><path d="M4 8l8 4 8-4" /></>,
  followups: <><path d="M5 5h14v11H9l-4 3V5Z" /><path d="M9 9h6M9 12h4" /></>,
  appointments: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  pipeline: <><path d="M5 19V9M12 19V5M19 19v-7" /><path d="m4 7 7-4 8 6" /></>,
  leads: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-4 2.5-6 5.5-6s5 2 5.5 6" /><path d="M16 8h5M18.5 5.5v5" /></>,
  review: <><path d="M6 3h9l4 4v14H6V3Z" /><path d="M15 3v5h4M9 13l2 2 4-5" /></>,
  quotations: <><path d="M6 3h12v18H6V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  approval: <><path d="M12 3 4 7v5c0 4.7 3.2 7.6 8 9 4.8-1.4 8-4.3 8-9V7l-8-4Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
  delivery: <><path d="M3 6h12v11H3V6Z" /><path d="M15 10h3l3 3v4h-6v-7ZM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></>,
  files: <><path d="M7 3h8l4 4v14H7V3Z" /><path d="M15 3v5h4M10 13h6M10 17h5" /></>,
  money: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5c-.8-.7-2-1-3.3-1-1.8 0-3.2.8-3.2 2.1 0 3.4 6.5 1.3 6.5 4.8 0 1.3-1.4 2.2-3.3 2.2-1.4 0-2.8-.5-3.7-1.3M12 5.5v13" /></>,
  targets: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="m14 10 6-6M16 4h4v4" /></>,
  reports: <><path d="M5 20V10h4v10H5ZM10 20V4h4v16h-4ZM15 20v-7h4v7h-4Z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  hygiene: <><path d="m6 18 9-9 3 3-9 9H6v-3Z" /><path d="m13 11-2-2 5-5 2 2-5 5ZM4 4l3 3M4 8l2-2" /></>,
  install: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
  audit: <><path d="M7 3h10v18H7V3Z" /><path d="M10 8h4M10 12h4M10 16h2" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
  chevron: <path d="m9 7 5 5-5 5" />
};

export function AppIcon({ name, className = "h-5 w-5" }: AppIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
