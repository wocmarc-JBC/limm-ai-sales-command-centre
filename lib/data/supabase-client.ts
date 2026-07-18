import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicKey, hasSupabaseEnv } from "./supabase-env";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!hasSupabaseEnv()) return null;
  if (cachedClient) return cachedClient;

  cachedClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublicKey(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  return cachedClient;
}
