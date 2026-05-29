const steps = [
  "1. Create a new Supabase project.",
  "2. Copy Project URL from Supabase Project Settings > API.",
  "3. Copy anon public key from Supabase Project Settings > API.",
  "4. Create .env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  "5. Do not put the service role key in frontend/app code.",
  "6. Apply migrations in the order listed in supabase/MIGRATION_ORDER.md.",
  "7. Create Marcus auth user in Supabase Authentication.",
  "8. Create admin auth user if needed.",
  "9. Run placeholder profile inserts from supabase/bootstrap_profiles.sql using real auth user UUIDs.",
  "10. Run npm run verify:live-supabase.",
  "11. Start local app with npm run dev.",
  "12. Login at /login and verify Dashboard, Settings, Appointment Settings, Approvals, Follow-Ups, Quotation Readiness, and Audit Log."
];

console.log("LIMM AI Sales Command Centre v3.3 Live Supabase Setup Checklist");
console.log("----------------------------------------------------------------");
for (const step of steps) console.log(step);
console.log("");
console.log("Reference docs:");
console.log("- LIVE_SUPABASE_SETUP_GUIDE.md");
console.log("- supabase/MIGRATION_ORDER.md");
console.log("- supabase/bootstrap_profiles.sql");
console.log("- RLS_VERIFICATION_NOTES.md");
