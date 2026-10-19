import type { Metadata } from "next";

export const metadata: Metadata = { title: "Staff sign-in", robots: { index: false, follow: false } };

/**
 * Staff sign-in. TODO: Supabase Auth email + password, then a TOTP challenge
 * (supabase.auth.mfa.challengeAndVerify) to reach AAL2, which currentStaff() requires.
 * Accounts are created by an admin; there is no public sign-up.
 */
export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">Staff sign-in</h1>
      <p className="text-sm text-muted">
        For CivicVoice moderators only. Sign-in with two-factor authentication is not wired up yet.
      </p>
    </main>
  );
}
