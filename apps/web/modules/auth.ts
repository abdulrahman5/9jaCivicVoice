import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { civicServiceClient } from "@civicvoice/db";
import { isConfigured } from "./env";

export type StaffRole = "admin" | "moderator" | "police_moderator";

export interface Staff {
  userId: string;
  email: string | undefined;
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
          // Called from a Server Component: cookies are read-only there; the proxy refreshes them.
        }
      },
    },
  });
}

/**
 * Returns the signed-in staff member, or null. Requires a 2FA-verified session
 * (AAL2): a password-only session is treated as signed out.
 */
export async function currentStaff(): Promise<Staff | null> {
  if (!isConfigured("supabase")) return null;
  const supabase = await authClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") return null;

  const { data: profile } = await civicServiceClient()
    .schema("ops")
    .from("staff")
    .select("role, active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.active) return null;

  return { userId: user.id, email: user.email, role: profile.role as StaffRole };
}
