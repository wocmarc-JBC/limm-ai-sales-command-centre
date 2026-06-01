"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { LogoutButton } from "@/components/auth/LogoutButton";
import type { AuthContext } from "@/lib/auth/session";
import { getSupabaseBrowserClient } from "@/lib/data/supabase-browser";
import { isReviewRouteEnabled } from "@/lib/review-route";

const appNavGroups = [
  {
    title: "Command",
    items: [
      { href: "/", label: "Dashboard" },
      { href: "/leads", label: "AI Lead Inbox" },
      { label: "Mission Queue", disabled: true }
    ]
  },
  {
    title: "Sales",
    items: [
      { label: "Sales Pipeline", disabled: true },
      { href: "/quotation-readiness", label: "Quotation Readiness" },
      { href: "/followups", label: "Follow-Ups" },
      { href: "/appointments", label: "Appointments" },
      { href: "/appointment-settings", label: "Appointment Settings" },
      { href: "/approvals", label: "Boss Approval" }
    ]
  },
  {
    title: "Accounts",
    items: [
      { label: "Sales & Collection", disabled: true },
      { label: "Targets", disabled: true },
      { href: "/reports", label: "Boss Report" }
    ]
  },
  {
    title: "Operations",
    items: [
      { href: "/client-files", label: "Client Files", disabled: true, note: "soon" },
      { href: "/settings#test-lead-cleanup", label: "Cleanup" },
      { href: "/audit-log", label: "Audit Log" }
    ]
  },
  {
    title: "System",
    items: [
      { href: "/settings", label: "Settings" },
      { href: "/reports", label: "QA Centre" },
      { href: "/settings", label: "Health / Diagnostics" }
    ]
  }
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
      <div className="rounded-lg border border-command-gold/50 bg-command-card px-3 py-2 text-[13px] text-command-muted md:mt-5">
        <p className="font-semibold text-command-gold">Mock UI Review Mode</p>
        <p>No Login Required</p>
        <p>No Live Actions</p>
        <p>Demo Data Only</p>
      </div>
    );
  }

  if (isLoginRoute) {
    return (
      <div className="rounded-lg border border-command-line bg-command-card px-3 py-2 text-[13px] text-command-muted md:mt-5">
        <p>{auth.mode}</p>
        <p>Secure sign-in</p>
      </div>
    );
  }

  const statusCardClass = "rounded-lg border border-command-line bg-command-card px-3 py-2 text-[13px] text-command-muted md:mt-5";

  if (auth.profile && auth.authenticated && clientAuthenticated) {
    return (
      <div className={statusCardClass}>
        <LogoutButton mode={auth.mode} />
        <p>{auth.mode}</p>
        <p>{auth.profile.fullName} | {auth.profile.role}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-command-line bg-command-card px-3 py-2 text-[13px] text-command-muted md:mt-5">
      <p>Login required</p>
      <Link href="/login" className="mt-2 inline-flex rounded-md border border-command-gold bg-command-gold px-3 py-2 text-[13px] font-semibold text-black">
        Go to Login
      </Link>
    </div>
  );
}

export function ShellChrome({ auth, children }: { auth: AuthContext; children: React.ReactNode }) {
  const pathname = usePathname();
  const [clientAuthenticated, setClientAuthenticated] = useState(auth.authenticated || auth.mode === "Mock Mode");
  const isTemporaryReviewRoute = isReviewRouteEnabled() && pathname === "/review-chatgpt-ui";
  const isLoginRoute = pathname === "/login";
  const mainClassName = isTemporaryReviewRoute
    ? "mx-auto max-w-[1440px] px-4 pb-10 pt-48 md:ml-64 md:px-8 md:pt-8 xl:px-10"
    : "mx-auto max-w-[1440px] px-4 pb-10 pt-36 md:ml-64 md:px-8 md:pt-8 xl:px-10";

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
    <div className="min-h-screen">
      <aside className="thin-scrollbar fixed inset-x-0 top-0 z-20 border-b border-command-line bg-command-bg/90 px-4 py-3 shadow-command backdrop-blur-xl md:bottom-0 md:left-0 md:right-auto md:h-screen md:w-64 md:overflow-y-auto md:overscroll-contain md:border-b-0 md:border-r md:px-5 md:py-6">
        <div className="flex items-center justify-between gap-3 md:block">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-command-cyan">LIMM Works</p>
            <h1 className="mt-1 text-xl font-semibold leading-6 text-command-text">Mission Control</h1>
          </div>
          <ShellStatus auth={auth} clientAuthenticated={clientAuthenticated} isTemporaryReviewRoute={isTemporaryReviewRoute} isLoginRoute={isLoginRoute} />
        </div>
        <nav className="thin-scrollbar mt-4 flex gap-3 overflow-x-auto pb-1 md:mt-8 md:block md:space-y-5 md:overflow-visible md:pb-6">
          {isTemporaryReviewRoute
            ? reviewNavItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="block whitespace-nowrap rounded-xl border border-transparent px-3 py-2.5 text-[15px] text-command-muted transition hover:border-command-line hover:bg-command-card hover:text-command-text"
                >
                  {item.label}
                </a>
              ))
            : appNavGroups.map((group) => (
                <div key={group.title} className="flex shrink-0 gap-2 md:block md:space-y-1">
                  <p className="hidden px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-command-subtle md:block">{group.title}</p>
                  {group.items.map((item) => {
                    const itemKey = `${group.title}-${item.label}`;
                    const active = "href" in item && item.href
                      ? item.href === "/" ? pathname === "/" : pathname.startsWith(item.href.split("#")[0])
                      : false;
                    const className = `block whitespace-nowrap rounded-xl border px-3 py-2.5 text-[15px] transition ${
                      active
                        ? "border-command-cyan/60 bg-command-cyan/10 text-command-text"
                        : "border-transparent text-command-muted hover:border-command-line hover:bg-command-card hover:text-command-text"
                    }`;
                    if (!("href" in item) || ("disabled" in item && item.disabled)) {
                      return (
                        <span key={itemKey} className="block whitespace-nowrap rounded-xl border border-transparent px-3 py-2.5 text-[15px] text-command-subtle opacity-65">
                          {item.label}{("note" in item && item.note) ? ` (${item.note})` : ""}
                        </span>
                      );
                    }
                    if (item.href.includes("#")) {
                      return <a key={itemKey} href={item.href} className={className}>{item.label}</a>;
                    }
                    return <Link key={itemKey} href={item.href} className={className}>{item.label}</Link>;
                  })}
                </div>
              ))}
        </nav>
      </aside>
      <AuthGate mode={auth.mode} initialAuthenticated={auth.authenticated}>
        <main className={mainClassName}>{children}</main>
      </AuthGate>
    </div>
  );
}
