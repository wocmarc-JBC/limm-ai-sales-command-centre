import { getDataMode, hasSupabaseEnv } from "@/lib/data/data-source";
import { getSupabaseServerClient } from "@/lib/data/supabase-server";
import { isQaE2EMode, QA_E2E_RUN_ID } from "@/lib/qa-e2e-mode";
import { cookies } from "next/headers";
import { can, type Permission, type UserRole } from "./roles";

export type CurrentProfile = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  active: boolean;
};

export type AuthContext = {
  mode: "Mock Mode" | "Supabase Mode";
  authenticated: boolean;
  profile: CurrentProfile | null;
  authEnabled: boolean;
  rlsExpected: boolean;
  rlsNotes: string;
};

async function qaRoleFromCookie(): Promise<{ role: UserRole; fullName: string; email: string }> {
  const role = (await cookies()).get("qa_e2e_role")?.value;
  if (role === "admin") return { role: "admin", fullName: "QA Admin", email: "qa.admin@limm.local" };
  if (role === "sales") return { role: "sales", fullName: "QA Sales", email: "qa.sales@limm.local" };
  if (role === "project") return { role: "viewer", fullName: "QA Project", email: "qa.project@limm.local" };
  return { role: "boss", fullName: "QA Boss", email: "qa.boss@limm.local" };
}

export async function getMockProfile(): Promise<CurrentProfile> {
  if (isQaE2EMode()) {
    const qa = await qaRoleFromCookie();
    return {
      id: `qa-${qa.role}-${QA_E2E_RUN_ID}`,
      email: qa.email,
      fullName: qa.fullName,
      role: qa.role,
      active: true
    };
  }

  return {
    id: "mock-marcus",
    email: "marcus.mock@limm.local",
    fullName: "Marcus Lim",
    role: "boss",
    active: true
  };
}

export async function getCurrentProfile(): Promise<AuthContext> {
  const mode = getDataMode();
  if (mode === "Mock Mode") {
    return {
      mode,
      authenticated: true,
      profile: await getMockProfile(),
      authEnabled: false,
      rlsExpected: false,
      rlsNotes: isQaE2EMode()
        ? "QA_E2E_MODE uses dedicated mock boss access and never mutates production data."
        : "Mock Mode uses demo boss access. Supabase Auth/RLS is not active without env vars."
    };
  }

  if (!hasSupabaseEnv()) {
    return {
      mode,
      authenticated: false,
      profile: null,
      authEnabled: false,
      rlsExpected: false,
      rlsNotes: "Supabase env vars missing."
    };
  }

  const supabase = await getSupabaseServerClient();
  const { data: userData } = await supabase!.auth.getUser();
  const user = userData.user;
  if (!user) {
    return {
      mode,
      authenticated: false,
      profile: null,
      authEnabled: true,
      rlsExpected: true,
      rlsNotes: "Supabase Auth is enabled. Login is required before app data is shown."
    };
  }

  const { data: profile } = await supabase!
    .from("profiles")
    .select("id,email,full_name,role,active")
    .eq("id", user.id)
    .maybeSingle();

  return {
    mode,
    authenticated: Boolean(profile?.active),
    profile: profile
      ? {
          id: profile.id,
          email: profile.email ?? user.email ?? "",
          fullName: profile.full_name ?? user.email ?? "User",
          role: profile.role as UserRole,
          active: profile.active ?? false
        }
      : null,
    authEnabled: true,
    rlsExpected: true,
    rlsNotes: profile?.active
      ? "Supabase Auth/RLS expected. Data access is role-aware through policies and action guards."
      : "Profile missing or inactive. Ask Marcus/admin to bootstrap the user profile."
  };
}

export async function requirePermission(permission: Permission) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated || !auth.profile) {
    return { ok: false, auth, error: "Login required." };
  }
  if (!can(auth.profile.role, permission)) {
    return { ok: false, auth, error: "Permission denied for this role." };
  }
  return { ok: true, auth, error: "" };
}
