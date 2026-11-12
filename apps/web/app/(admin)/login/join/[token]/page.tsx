import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_LABEL, inviteDetails } from "@/modules/election/staff";
import { JoinForm } from "./JoinForm";

export const metadata: Metadata = {
  title: "Join as an election moderator",
  robots: { index: false, follow: false },
  // Keep the invite token out of Referer headers sent to other sites.
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

const GONE = {
  used: "This invite link has already been used. Each link works once: ask your coordinator for a new one.",
  revoked: "This invite link was cancelled. Ask your coordinator for a new one.",
  expired: "This invite link has expired: links last 7 days. Ask your coordinator for a new one.",
} as const;

/** A volunteer's single-use invite link (task E5): sign up, then two-factor, then training. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await inviteDetails(token);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-5 p-8">
      <div>
        <p className="font-mono text-xs text-muted">CIVICVOICE ELECTIONS</p>
        <h1 className="text-2xl font-bold">Join as a moderator</h1>
      </div>
      {!invite ? (
        <p className="text-[15px]">This invite link isn&apos;t valid. Check you copied all of it, or ask your coordinator for a new one.</p>
      ) : invite.status !== "open" ? (
        <p className="text-[15px]">{GONE[invite.status]}</p>
      ) : (
        <>
          <div className="rounded-card border border-line bg-surface p-4 text-[15px]">
            <p>
              {invite.inviter} invited you to be a <strong>{ROLE_LABEL[invite.role].toLowerCase()}</strong> for{" "}
              <strong>{invite.lga_name ? `${invite.lga_name}, ${invite.state_name}` : invite.state_name}</strong>.
            </p>
          </div>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
            <li>Create your account</li>
            <li>Set up an authenticator app on your phone</li>
            <li>Pass a short training check, then practise on fake reports</li>
          </ol>
          <JoinForm token={token} />
        </>
      )}
      <p className="text-xs text-muted">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
