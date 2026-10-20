import Link from "next/link";
import { CATEGORIES, City } from "@civicvoice/validation";
import { t } from "@civicvoice/i18n";
import { BottomNav } from "@/components/BottomNav";
import { StatusPill } from "@/components/StatusPill";
import { latestIssues } from "@/modules/public-data";

export const revalidate = 300;

const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  roads: "Roads",
  electricity: "Power",
  water: "Water",
  health: "Health",
  public_service: "Public services",
};

const CITY_LABELS = { lagos: "Lagos", fct: "FCT Abuja" } as const;

/** Home (wireframe 1.1). */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const city = City.catch("lagos").parse((await searchParams).city);
  const issues = await latestIssues(city);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <div className="text-xl font-bold">{t("en", "app.name")}</div>
          <nav aria-label="City" className="flex gap-3 text-sm">
            {City.options.map((c) => (
              <Link
                key={c}
                href={`/?city=${c}`}
                aria-current={c === city ? "page" : undefined}
                className={c === city ? "font-semibold text-ink no-underline" : "text-muted no-underline"}
              >
                {CITY_LABELS[c]}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 px-5 pb-6">
        <Link
          href="/report"
          className="flex items-center justify-between rounded-2xl bg-accent p-5 text-white no-underline hover:text-white"
        >
          <span className="flex flex-col gap-1">
            <span className="text-xl font-bold">{t("en", "home.reportCta")}</span>
            <span className="text-sm text-accent-soft">{t("en", "home.reportCtaSub")}</span>
          </span>
          <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-white text-2xl text-accent">
            +
          </span>
        </Link>

        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold">Browse by category</h2>
          <div className="grid grid-cols-3 gap-2.5">
            {CATEGORIES.map((c) => (
              <Link
                key={c}
                href={`/report?category=${c}`}
                className="flex min-h-16 items-center justify-center rounded-card border border-line bg-surface p-3 text-center text-[13px] text-ink no-underline"
              >
                {CATEGORY_LABELS[c]}
              </Link>
            ))}
            {process.env.NEXT_PUBLIC_POLICE_FORM_URL ? (
              <a
                href={process.env.NEXT_PUBLIC_POLICE_FORM_URL}
                className="flex min-h-16 items-center justify-center rounded-card border border-police bg-surface p-3 text-center text-[13px] text-police no-underline"
              >
                Police conduct
              </a>
            ) : (
              <span className="flex min-h-16 flex-col items-center justify-center rounded-card border border-line bg-surface p-3 text-center text-[13px] text-muted">
                Police conduct
                <span className="text-[11px]">Coming soon</span>
              </span>
            )}
          </div>
          <Link href="/police" className="text-[13px] font-semibold">
            See police conduct patterns
          </Link>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">{t("en", "home.nearYou")}</h2>
            <Link href="/map" className="text-[13px] font-semibold">
              See on map
            </Link>
          </div>
          {issues.length === 0 ? (
            <p className="rounded-card border border-dashed border-line p-4 text-sm text-muted">
              No published issues yet in {CITY_LABELS[city]}. Be the first to report one.
            </p>
          ) : (
            issues.map((issue) => (
              <Link
                key={issue.ref_code}
                href={`/track/${issue.ref_code}`}
                className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-3 text-ink no-underline"
              >
                <span className="text-[15px] font-semibold">{issue.title}</span>
                <span className="text-[13px] text-muted">
                  {issue.lga ?? CITY_LABELS[city]} · {new Date(issue.created_at).toLocaleDateString("en-NG")}
                </span>
                <span className="flex items-center justify-between">
                  <StatusPill status={issue.status} />
                  <span className="text-xs font-semibold">Me too · {issue.metoo_count}</span>
                </span>
              </Link>
            ))
          )}
        </section>
      </main>

      <BottomNav active="home" />
    </div>
  );
}
