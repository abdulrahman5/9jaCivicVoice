import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authClient, currentStaff } from "@/modules/auth";
import { CodeForm } from "./CodeForm";

export const metadata: Metadata = { title: "Authenticator code", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Staff sign-in, step 2 of 2 (returning staff). */
export default async function VerifyPage() {
  if (await currentStaff()) redirect("/admin");
  const { data } = await (await authClient()).auth.getUser();
  if (!data.user) redirect("/login");

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-5 p-8">
      <h1 className="text-2xl font-bold">Enter your code</h1>
      <p className="text-sm text-muted">Open your authenticator app and enter the 6-digit code for CivicVoice.</p>
      <CodeForm />
    </main>
  );
}
