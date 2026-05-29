"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { LogoutButton } from "@/components/auth/LogoutButton";
import type { AuthContext } from "@/lib/auth/session";
import { getSupabaseBrowserClient } from "@/lib/data/supabase-browser";
import { isReviewRouteEnabled } from "@/lib/review-route";

const appNavItems = [
  { href: "/", label: "Dashboard" },
  { href: "/leads", label: "AI Lead Inbox" },
  { href: "/appointments", label: "Appointments" },
  { href: "/appointment-settings", label: "Appointment Settings" },
  { href: "/approvals", label: "Boss Approval" },
  { href: "/followups", label: "Follow-Ups" },
  { href: "/quotation-readiness", label: "Quotation Readiness" },
  { href: "/client-files", label: "Client Files" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
  { href: "/audit-log", label: "Audit Log" }
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
      <div className="rounded border border-command-cyan/50 bg-command-panel px-3 py-2 text-xs text-command-muted md:mt-4">
        <p className="font-semibold text-command-cyan">Mock UI Review Mode</p>
        <p>No Login Required</p>
        <p>No Live Actions</p>
        <p>Demo Data Only</p>
      </div>
    );
  }

  if (isLoginRoute) {
    return (
      <div className="rounded border border-command-line bg-command-panel px-3 py-2 text-xs text-command-muted md:mt-4">
        <p>{auth.mode}</p>
        <p>Secure sign-in</p>
      </div>
    );
  }

  if (auth.profile && auth.authenticated && clientAuthenticated) {
    return (
      <div className="rounded border border-command-line bg-command-panel px-3 py-2 text-xs text-command-muted md:mt-4">
        <p>{auth.mode}</p>
        <p>{auth.profile.fullName} | {auth.profile.role}</p>
        <LogoutButton mode={auth.mode} />
      </div>
    );
  }

  return (
    <div className="rounded border border-command-line bg-command-panel px-3 py-2 text-xs text-command-muted md:mt-4">
      <p>Login required</p>
      <Link href="/login" className="mt-2 inline-flex rounded border border-command-cyan bg-command-cyan px-3 py-2 text-xs font-semibold text-black">
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
    ? "px-4 pb-10 pt-48 md:ml-64 md:px-8 md:pt-8"
    : "px-4 pb-10 pt-36 md:ml-64 md:px-8 md:pt-8";

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
      <aside className="fixed inset-x-0 top-0 z-20 border-b border-command-line bg-command-bg/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-0 md:right-auto md:w-64 md:border-b-0 md:border-r md:px-5 md:py-6">
        <div className="flex items-center justify-between gap-3 md:block">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-cyan">LIMM Works</p>
            <h1 className="mt-1 text-lg font-semibold text-command-text">AI Sales Command Centre v3</h1>
          </div>
          <ShellStatus auth={auth} clientAuthenticated={clientAuthenticated} isTemporaryReviewRoute={isTemporaryReviewRoute} isLoginRoute={isLoginRoute} />
        </div>
        <nav className="thin-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1 md:mt-8 md:block md:space-y-1 md:overflow-visible md:pb-0">
          {isTemporaryReviewRoute
            ? reviewNavItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="block whitespace-nowrap rounded border border-transparent px-3 py-2 text-sm text-command-muted transition hover:border-command-line hover:bg-command-panel hover:text-command-text"
                >
                  {item.label}
                </a>
              ))
            : appNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block whitespace-nowrap rounded border border-transparent px-3 py-2 text-sm text-command-muted transition hover:border-command-line hover:bg-command-panel hover:text-command-text"
                >
                  {item.label}
                </Link>
              ))}
        </nav>
      </aside>
      <AuthGate mode={auth.mode} initialAuthenticated={auth.authenticated}>
        <main className={mainClassName}>{children}</main>
      </AuthGate>
    </div>
  );
}
