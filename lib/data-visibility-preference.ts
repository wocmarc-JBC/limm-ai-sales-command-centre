import { cookies } from "next/headers";
import { can } from "@/lib/auth/roles";
import { getCurrentProfile } from "@/lib/auth/session";

export const SHOW_TEST_DEMO_RECORDS_COOKIE = "limm_show_test_demo_records";

export async function getShowTestDemoRecordsPreference() {
  const auth = await getCurrentProfile();
  if (!auth.profile || !can(auth.profile.role, "edit_settings")) return false;
  return cookies().get(SHOW_TEST_DEMO_RECORDS_COOKIE)?.value === "1";
}

export function setShowTestDemoRecordsPreference(enabled: boolean) {
  cookies().set(SHOW_TEST_DEMO_RECORDS_COOKIE, enabled ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}
