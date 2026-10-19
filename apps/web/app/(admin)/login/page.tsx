import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentStaff } from "@/modules/auth";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Staff sign-in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Staff sign-in, step 1 of 2. Accounts are created by an admin (`pnpm staff:create`). */
export default async function LoginPage() {
  if (await currentStaff()) redirect("/admin");
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-5 p-8">
      <div>
        <p className="font-mono text-xs text-muted">CIVICVOICE OPS</p>
        <h1 className="text-2xl font-bold">Staff sign-in</h1>
      </div>
      <SignInForm />
      <p className="text-xs text-muted">
        For moderators only. You&apos;ll also need the authenticator app on your phone.
      </p>
    </main>
  );
}
