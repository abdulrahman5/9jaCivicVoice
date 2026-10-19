import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { civicServiceClient } from "@civicvoice/db";
import { isConfigured } from "./env";

export type StaffRole = "admin" | "moderator" | "police_moderator";

export interface Staff {
  userId: string;
  email: string | undefined;
  displayName: string;
  role: StaffRole;
}

/** Cookie-based Supabase Auth client for moderators (never used for citizens). */
export async function authClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there; proxy.ts refreshes them.
        }
      },
    },
  });
}

/** Active staff profile for a user id, or null. */
export async function staffProfile(userId: string) {
  const { data } = await civicServiceClient()
    .schema("ops")
    .from("staff")
    .select("display_name, role, active")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.active ? { displayName: data.display_name as string, role: data.role as StaffRole } : null;
}

/**
 * Returns the signed-in staff member, or null. Requires a session verified with
 * an authenticator code (AAL2): a password-only session counts as signed out.
 */
export async function currentStaff(): Promise<Staff | null> {
  if (!isConfigured("supabase")) return null;
  const supabase = await authClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") return null;

  const profile = await staffProfile(user.id);
  if (!profile) return null;
  return { userId: user.id, email: user.email, ...profile };
}

/** For server actions and admin pages: the staff member, or a redirect to sign-in. */
export async function requireStaff(roles?: StaffRole[]): Promise<Staff> {
  const staff = await currentStaff();
  if (!staff) redirect("/login");
  if (roles && !roles.includes(staff.role)) throw new Error("You don't have permission to do that.");
  return staff;
}
