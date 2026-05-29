import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasSupabaseEnv } from "./data-source";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!hasSupabaseEnv()) return null;
  if (cachedClient) return cachedClient;

  cachedClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  return cachedClient;
}
