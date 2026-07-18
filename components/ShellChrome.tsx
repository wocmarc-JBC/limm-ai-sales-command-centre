"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { AuthGate } from "@/components/auth/AuthGate";
import { LogoutButton } from "@/components/auth/LogoutButton";
import type { AuthContext } from "@/lib/auth/session";
import { getSupabaseBrowserClient } from "@/lib/data/supabase-browser";
import { isReviewRouteEnabled } from "@/lib/review-route";

const appNavGroups = [
  {
    title: "Today",
    items: [
      { href: "/", label: "Boss Daily Brief", icon: "today" },
      { href: "/command-core", label: "Command Core", icon: "command" },
      { href: "/inbox", label: "WhatsApp Inbox", icon: "inbox" },
      { href: "/followups", label: "Follow-Ups", icon: "followups" },
      { href: "/appointments", label: "Appointments", icon: "appointments" }
    ]
  },
  {
    title: "Sales Pipeline",
    items: [
      { href: "/sales-pipeline", label: "Sales Pipeline", icon: "pipeline" },
      { href: "/leads", label: "Lead Inbox", icon: "leads" },
      { href: "/quotation-readiness", label: "Quotation Review", icon: "review" },
      { href: "/quotations", label: "Quotations", icon: "quotations" },
      { href: "/approvals", label: "Boss Review Gate", icon: "approval" }
    ]
  },
  {
    title: "Delivery",
    items: [
      { href: "/delivery", label: "Do Not Start Gate", icon: "delivery" },
      { href: "/client-files", label: "Client Files", icon: "files" }
    ]
  },
  {
    title: "Money",
    items: [
      { href: "/sales-collection", label: "Collection Queue", icon: "money" },
      { href: "/targets", label: "Targets", icon: "targets" },
      { href: "/reports", label: "Boss Report", icon: "reports" }
    ]
  },
  {
    title: "Admin",
    items: [
      { href: "/settings", label: "Settings", icon: "settings" },
      { href: "/data-hygiene", label: "Data Hygiene", icon: "hygiene" },
      { href: "/install", label: "Install App", icon: "install" },
      { href: "/audit-log", label: "Audit Log", icon: "audit" }
    ]
  }
] as const;

const mobileNavItems = [
  { href: "/", label: "Today", icon: "today" },
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/sales-pipeline", label: "Pipeline", icon: "pipeline" },
  { href: "/delivery", label: "Delivery", icon: "delivery" },
  { href: "/sales-collection", label: "Money", icon: "money" },
  { href: "/settings", label: "Admin", icon: "settings" }
] as const;

const reviewNavItems = [
  { href: "#dashboard", label: "Dashboard" },
  { href: "#lead-inbox", label: "Lead Inbox" },
  { href: "#lead-detail", label: "Lead Detail" },
  { href: "#appointment-settings", label: "Appointment Settings" },
  { href: "#approvals", label: "Boss Approval" },
  { href: "#followups", label: "Follow-Ups" },
  { href: "#quotation-readiness", label: "Quotation Readiness" },
  { href: "#client-files", label: "Client Files" },
  { href: "#system-health", label: "System Health" },
  { href: "#audit-log", label: "Audit Log" }
];

function ShellStatus({
  auth,
  clientAuthenticated,
  isTemporaryReviewRoute,
  isLoginRoute
}: {
  auth: AuthContext;
  clientAuthenticated: boolean;
  isTemporaryReviewRoute: boolean;
  isLoginRoute: boolean;
}) {
  if (isTemporaryReviewRoute) {
    return (
      <div className="rounded-xl border border-command-gold/40 bg-command-gold/10 px-3 py-2 text-xs text-command-muted lg:mt-4">
        <p className="font-semibold text-command-gold">Review mode</p>
        <p className="hidden lg:block">Demo data · no live actions</p>
        <span className="sr-only">Mock UI Review Mode. No Login Required. No Live Actions. Demo Data Only.</span>
      </div>
    );
  }

  if (isLoginRoute) {
    return (
      <div className="rounded-xl border border-command-line bg-command-card px-3 py-2 text-xs text-command-muted lg:mt-4">
        <p>Secure sign-in</p>
      </div>
    );
  }

  if (auth.profile && auth.authenticated && clientAuthenticated) {
    const initials = auth.profile.fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "LW";
    return (
      <details
        className="group relative lg:mt-4"
        data-testid="shell-account-menu"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.currentTarget.removeAttribute("open");
          event.currentTarget.querySelector("summary")?.focus();
        }}
      >
        <summary
          aria-label={`Account menu for ${auth.profile.fullName}`}
          className="flex min-h-11 list-none items-center gap-2 rounded-xl border border-command-line bg-command-card px-2.5 py-2 text-left transition hover:border-command-gold/45 hover:bg-command-elevated [&::-webkit-details-marker]:hidden"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-command-gold/15 text-xs font-bold text-command-gold ring-1 ring-command-gold/25">
            {initials}
          </span>
          <span className="hidden min-w-0 flex-1 lg:block">
            <span className="block truncate text-xs font-semibold text-command-text">{auth.profile.fullName}</span>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-command-subtle">{auth.profile.role}</span>
          </span>
          <AppIcon name="chevron" className="hidden h-4 w-4 text-command-subtle transition group-open:rotate-90 lg:block" />
        </summary>
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 rounded-2xl border border-command-line bg-command-panel2 p-3 shadow-premium lg:left-0 lg:right-auto lg:w-full">
          <p className="truncate text-sm font-semibold text-command-text">{auth.profile.fullName}</p>
          <p className="mt-0.5 text-xs capitalize text-command-muted">{auth.profile.role} access</p>
          <div className="mt-3 border-t border-command-line pt-3">
            <LogoutButton mode={auth.mode} compact />
          </div>
        </div>
      </details>
    );
  }

  return (
    <div className="rounded-xl border border-command-line bg-command-card px-2.5 py-2 text-xs text-command-muted lg:mt-4">
      <p className="hidden lg:block">Login required</p>
      <Link href="/login" className="inline-flex min-h-9 items-center rounded-lg border border-command-gold bg-command-gold px-3 py-1.5 text-xs font-semibold text-black lg:mt-2">
        Sign in
      </Link>
    </div>
  );
}

export function ShellChrome({
  auth,
  children,
  qaE2eMode = false,
  qaRunId = ""
}: {
  auth: AuthContext;
  children: React.ReactNode;
  qaE2eMode?: boolean;
  qaRunId?: string;
}) {
  const pathname = usePathname();
  const [clientAuthenticated, setClientAuthenticated] = useState(auth.authenticated || auth.mode === "Mock Mode");
  const isTemporaryReviewRoute = isReviewRouteEnabled() && pathname === "/review-chatgpt-ui";
  const isLoginRoute = pathname === "/login";
  const isInboxRoute = pathname.startsWith("/inbox");
  const mobileTopPadding = qaE2eMode ? "pt-32" : "pt-20";
  const mainClassName = isInboxRoute
    ? `px-2.5 pb-24 ${mobileTopPadding} sm:px-4 lg:ml-56 lg:px-4 lg:pb-6 lg:pt-5 xl:px-5`
    : `mx-auto max-w-[1600px] px-4 pb-24 ${mobileTopPadding} md:px-6 lg:ml-56 lg:pb-10 lg:pt-6 xl:px-8`;

  useEffect(() => {
    if (auth.mode === "Mock Mode") {
      setClientAuthenticated(true);
      return;
    }

    let active = true;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (active) setClientAuthenticated(Boolean(data.session));
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setClientAuthenticated(Boolean(session));
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [auth.mode]);

  return (
    <div className="min-h-screen" data-qa-e2e={qaE2eMode ? "true" : "false"}>
      <aside className="thin-scrollbar fixed inset-x-0 top-0 z-40 border-b border-command-line bg-command-bg/95 px-4 py-2 shadow-command backdrop-blur-xl lg:bottom-0 lg:left-0 lg:right-auto lg:h-screen lg:w-56 lg:overflow-y-auto lg:overscroll-contain lg:border-b-0 lg:border-r lg:px-3 lg:py-4">
        {qaE2eMode ? (
          <div className="mb-2 rounded-lg border border-command-amber/50 bg-command-amber/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-command-amber lg:mb-3" data-testid="qa-e2e-banner">
            QA / staging dry-run {qaRunId ? `- ${qaRunId}` : ""}
          </div>
        ) : null}
        <div className="flex min-h-12 items-center justify-between gap-3 lg:block lg:min-h-0 lg:px-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-command-gold">LIMM Works</p>
            <h1 className="truncate text-lg font-semibold leading-6 text-command-text lg:mt-0.5">Mission Control</h1>
          </div>
          <ShellStatus auth={auth} clientAuthenticated={clientAuthenticated} isTemporaryReviewRoute={isTemporaryReviewRoute} isLoginRoute={isLoginRoute} />
        </div>
        <nav className="thin-scrollbar mt-5 hidden space-y-4 overflow-visible pb-5 lg:block" aria-label="Primary navigation">
          {isTemporaryReviewRoute
            ? reviewNavItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="block whitespace-nowrap rounded-xl border border-transparent px-3 py-2 text-sm text-command-muted transition hover:border-command-line hover:bg-command-card hover:text-command-text"
                >
                  {item.label}
                </a>
              ))
            : appNavGroups.map((group) => (
                <div key={group.title} className="space-y-0.5">
                  <p className="px-3 pb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-command-subtle">{group.title}</p>
                  {group.items.map((item) => {
                    const itemKey = `${group.title}-${item.label}`;
                    const hrefBase = "href" in item && item.href ? item.href.split("#")[0] : "";
                    const active = hrefBase
                      ? hrefBase === "/"
                        ? pathname === "/"
                        : pathname.startsWith(hrefBase)
                      : false;
                    const className = `group/nav flex min-h-10 items-center gap-2.5 whitespace-nowrap rounded-xl border px-2.5 py-2 text-sm transition ${
                      active
                        ? "border-command-gold/40 bg-command-gold/10 text-command-text shadow-[inset_2px_0_0_#DDB35D]"
                        : "border-transparent text-command-muted hover:border-command-line hover:bg-command-card hover:text-command-text"
                    }`;
                    if (!("href" in item) || ("disabled" in item && item.disabled)) {
                      return (
                        <span key={itemKey} className="block whitespace-nowrap rounded-xl border border-transparent px-3 py-2 text-sm text-command-subtle opacity-65">
                          {item.label}{("note" in item && item.note) ? ` (${item.note})` : ""}
                        </span>
                      );
                    }
                    if (item.href.includes("#")) {
                      return <a key={itemKey} href={item.href} className={className}>{item.label}</a>;
                    }
                    return (
                      <Link key={itemKey} href={item.href} className={className} aria-current={active ? "page" : undefined}>
                        <AppIcon name={item.icon} className={`h-[18px] w-[18px] shrink-0 ${active ? "text-command-gold" : "text-command-subtle group-hover/nav:text-command-muted"}`} />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
        </nav>
      </aside>
      <AuthGate mode={auth.mode} initialAuthenticated={auth.authenticated}>
        <main className={mainClassName}>{children}</main>
      </AuthGate>
      {!isTemporaryReviewRoute && !isLoginRoute ? (
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-command-line bg-command-bg/95 px-1 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-1.5 shadow-command backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
          {mobileNavItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`mx-0.5 flex min-h-[3.4rem] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1 text-center text-[10px] font-semibold leading-tight transition ${
                  active
                    ? "border-command-gold/35 bg-command-gold/10 text-command-gold"
                    : "border-transparent text-command-muted hover:border-command-line hover:bg-command-card"
                }`}
              >
                <AppIcon name={item.icon} className="h-[18px] w-[18px]" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
