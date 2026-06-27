"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/data/supabase-browser";
import { isReviewRouteEnabled } from "@/lib/review-route";

export function AuthGate({
  mode,
  initialAuthenticated,
  children
}: {
  mode: "Mock Mode" | "Supabase Mode";
  initialAuthenticated: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isTemporaryReviewRoute = isReviewRouteEnabled() && pathname === "/review-chatgpt-ui";
  const isTokenUploadRoute = pathname.startsWith("/upload/");
  const [authenticated, setAuthenticated] = useState(initialAuthenticated || mode === "Mock Mode");

  useEffect(() => {
    if (mode === "Mock Mode") {
      setAuthenticated(true);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => setAuthenticated(Boolean(data.session)));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session));
    });

    return () => subscription.subscription.unsubscribe();
  }, [mode]);

  if (mode === "Supabase Mode" && !authenticated && pathname !== "/login" && !isTemporaryReviewRoute && !isTokenUploadRoute) {
    return (
      <main className="px-4 pb-10 pt-28 md:ml-64 md:px-8 md:pt-8">
        <div className="rounded border border-command-line bg-command-panel p-6 shadow-command">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-command-cyan">Supabase Mode</p>
          <h2 className="mt-2 text-2xl font-semibold">Login required</h2>
          <p className="mt-3 text-command-muted">This Command Centre is protected when Supabase is configured.</p>
          <Link href="/login" className="mt-5 inline-flex rounded border border-command-cyan bg-command-cyan px-4 py-2 text-sm font-semibold text-black">
            Go to Login
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
