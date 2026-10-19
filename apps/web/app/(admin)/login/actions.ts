"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authClient, staffProfile } from "@/modules/auth";

export interface FormState {
  error?: string;
  /** Echoed back so the field stays filled after a failed attempt (React resets forms after actions). */
  email?: string;
}

const Credentials = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const CODE = z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app");

/** Step 1: email + password (AAL1). Then on to the authenticator code. */
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = Credentials.safeParse(Object.fromEntries(formData));
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: "Enter your email and password.", email };

  const supabase = await authClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  // Same message for unknown email and wrong password, to avoid revealing who has an account.
  if (error || !data.user) return { error: "That email and password don't match a staff account.", email };

  if (!(await staffProfile(data.user.id))) {
    await supabase.auth.signOut();
    return { error: "This account isn't an active CivicVoice staff account.", email };
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  redirect(factors?.totp.length ? "/login/verify" : "/login/enroll");
}

/** Step 2 for returning staff: the 6-digit code reaches AAL2. */
export async function verifyCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = CODE.safeParse(formData.get("code"));
  if (!code.success) return { error: code.error.issues[0]!.message };

  const supabase = await authClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp[0];
  if (!factor) redirect("/login/enroll");

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.data });
  if (error) return { error: "That code didn't work. Codes change every 30 seconds; try the current one." };
  redirect("/admin");
}

export interface EnrollState extends FormState {
  factorId?: string;
  qrCode?: string;
  secret?: string;
}

/** First sign-in: create a TOTP factor and show its QR code. */
export async function startEnrollment(): Promise<EnrollState> {
  const supabase = await authClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  // Clear abandoned, never-verified attempts so names stay unique and old QR codes stop working.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp.length) redirect("/login/verify");
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `CivicVoice ${new Date().toISOString().slice(0, 16)}`,
  });
  if (error || !data) return { error: "Couldn't start authenticator setup. Try again." };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyEnrollment(prev: EnrollState, formData: FormData): Promise<EnrollState> {
  const code = CODE.safeParse(formData.get("code"));
  const factorId = prev.factorId;
  if (!factorId) return { error: "Setup expired. Reload the page and start again." };
  if (!code.success) return { factorId, error: code.error.issues[0]!.message };

  const supabase = await authClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.data });
  if (error) return { factorId, error: "That code didn't work. Check your phone's clock and try the current code." };
  redirect("/admin");
}

export async function signOut() {
  const supabase = await authClient();
  await supabase.auth.signOut();
  redirect("/login");
}
