"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicKey } from "./supabase-env";

export function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublicKey()
  );
}
