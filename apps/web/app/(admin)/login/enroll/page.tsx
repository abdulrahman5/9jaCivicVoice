import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authClient, currentStaff } from "@/modules/auth";
import { EnrollForm } from "./EnrollForm";

export const metadata: Metadata = { title: "Set up your authenticator", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** First sign-in: every staff account must set up an authenticator app (TOTP). */
export default async function EnrollPage() {
  if (await currentStaff()) redirect("/admin");
  const { data } = await (await authClient()).auth.getUser();
  if (!data.user) redirect("/login");

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-5 p-8">
      <h1 className="text-2xl font-bold">Set up your authenticator</h1>
      <p className="text-sm text-muted">
        Staff accounts need a second step at every sign-in. Install an authenticator app (Google Authenticator,
        Microsoft Authenticator, Aegis or similar) on your phone, then continue.
      </p>
      <EnrollForm />
    </main>
  );
}
