import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedSql = fs.readFileSync(path.join(root, "supabase", "seed.sql"), "utf8");
const hasSupabaseEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

if (!hasSupabaseEnv) {
  console.log("Mock Mode: Supabase env vars are missing. Demo data is already available through the mock fallback store.");
  console.log("Seed SQL is ready at supabase/seed.sql for a future Supabase project.");
  process.exit(0);
}

console.log("Supabase Mode: demo seed SQL is ready.");
console.log("Apply it in Supabase SQL editor or through the Supabase CLI after migrations:");
console.log(path.join(root, "supabase", "seed.sql"));
console.log(`Seed bytes: ${Buffer.byteLength(seedSql, "utf8")}`);
