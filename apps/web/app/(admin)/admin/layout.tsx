import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStaff } from "@/modules/auth";
import { signOut } from "../login/actions";

export const metadata: Metadata = { title: "Ops console", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Moderation console shell (wireframe 3.1). Every page below requires a 2FA staff session. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await currentStaff();
  if (!staff) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-wrap">
      <aside className="flex flex-[1_1_200px] flex-col gap-5 border-r border-line bg-surface p-4">
        <div>
          <div className="text-lg font-bold">CivicVoice</div>
          <div className="font-mono text-[11px] text-muted">OPS CONSOLE</div>
        </div>
        <nav aria-label="Console" className="flex flex-col gap-1 text-sm">
          <Link href="/admin" className="rounded-lg px-2 py-2 text-ink no-underline hover:bg-fill">
            Moderation queue
          </Link>
        </nav>
        <div className="mt-auto flex flex-col gap-2 text-xs text-muted">
          <span>
            {staff.displayName} · {staff.role.replace("_", " ")}
          </span>
          <form action={signOut}>
            <button type="submit" className="text-sm font-semibold text-accent">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-[999_1_560px] p-6">{children}</main>
    </div>
  );
}
