"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TAXONOMY, type Category, type City } from "@civicvoice/validation";
import { Turnstile, turnstileSiteKey } from "@/components/Turnstile";
import { rememberReport } from "@/modules/my-reports";

const CATEGORY_LABELS: Record<Category, { title: string; hint: string }> = {
  roads: { title: "Roads & drainage", hint: "Potholes, flooding, streetlights" },
  electricity: { title: "Electricity", hint: "Outages, billing, meters" },
  water: { title: "Water & sanitation", hint: "No supply, broken borehole, waste" },
  health: { title: "Health facility", hint: "Closed clinic, no drugs, absent staff" },
  public_service: { title: "Public service", hint: "NIN, passport, licence delays" },
};

const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

type Location = { lat: number; lng: number } | null;
const DRAFT_KEY = "cv:report-draft";

/**
 * Web report flow (wireframes 1.2 and 1.3).
 * Step 1: category + sub-type. Step 2: location, description, anonymity. Step 3: review.
 * Drafts persist in localStorage so a dropped connection doesn't lose the report.
 *
 * TODO (PRD F2/F3): photo + voice note upload via signed URLs with
 * @civicvoice/media processing, and the duplicate check before submit.
 */
export function ReportFlow({ initialCategory }: { initialCategory?: Category }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [city, setCity] = useState<City>("lagos");
  const [category, setCategory] = useState<Category | undefined>(initialCategory);
  const [subcategory, setSubcategory] = useState<string>();
  const [location, setLocation] = useState<Location>(null);
  const [locating, setLocating] = useState(false);
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  // Bot protection: a Turnstile token is required when a site key is configured.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const needsToken = Boolean(turnstileSiteKey);

  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
      if (draft?.description) setDescription(draft.description);
    } catch {
      // Ignore unreadable drafts.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ description }));
    } catch {
      // Storage can be unavailable (private mode); drafts are a convenience only.
    }
  }, [description]);

  function locate() {
    if (!navigator.geolocation) return setError("Location isn't available on this device.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        setError(undefined);
      },
      () => {
        setLocating(false);
        setError("We couldn't get your location. Check your browser's location permission.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function submit() {
    if (!category || !subcategory || !location) return;
    if (needsToken && !turnstileToken) return;
    setSubmitting(true);
    setError(undefined);
    let res: Response;
    try {
      res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          city,
          category,
          subcategory,
          location,
          description,
          phone: phone || undefined,
          turnstileToken: turnstileToken ?? undefined,
        }),
      });
    } catch {
      setSubmitting(false);
      return setError("No connection. Your draft is saved; try again when you're back online.");
    }
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      // A Turnstile token is single-use: get a fresh one before the retry.
      setTurnstileReset((n) => n + 1);
      return setError(data.error ?? "Something went wrong. Your draft is saved; try again.");
    }
    const { ref, trackingToken } = (await res.json()) as { ref: string; trackingToken: string };
    rememberReport({ ref, trackingToken });
    localStorage.removeItem(DRAFT_KEY);
    router.push(`/track/${ref}?new=1`);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center justify-between px-3 pt-4 pb-2">
        {step === 1 ? (
          <Link href="/" className="flex size-11 items-center justify-center text-ink no-underline" aria-label="Back">
            ←
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => (s - 1) as 1 | 2)}
            className="flex size-11 items-center justify-center"
            aria-label="Back"
          >
            ←
          </button>
        )}
        <span className="text-[15px] font-semibold">New report</span>
        <span className="w-11" />
      </header>

      <div className="flex flex-col gap-2 px-5 pb-4">
        <div className="flex gap-1.5" aria-label={`Step ${step} of 3`}>
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-1 flex-1 rounded ${n <= step ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
        <p className="font-mono text-xs text-muted">STEP {step} OF 3</p>
      </div>

      <main className="flex flex-1 flex-col gap-3 px-5">
        {step === 1 && (
          <>
            <h1 className="text-2xl font-bold">What&apos;s the issue about?</h1>
            {(Object.keys(TAXONOMY) as Category[]).map((c) => (
              <div
                key={c}
                className={`rounded-card bg-surface p-3.5 ${category === c ? "border-2 border-accent" : "border border-line"}`}
              >
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="category"
                    checked={category === c}
                    onChange={() => {
                      setCategory(c);
                      setSubcategory(undefined);
                    }}
                    className="size-5 accent-accent"
                  />
                  <span className="flex flex-col">
                    <span className="text-[15px] font-semibold">{CATEGORY_LABELS[c].title}</span>
                    <span className="text-[13px] text-muted">{CATEGORY_LABELS[c].hint}</span>
                  </span>
                </label>
                {category === c && (
                  <fieldset className="mt-3 flex flex-wrap gap-2 pl-8">
                    <legend className="mb-2 text-[13px] font-semibold">What exactly?</legend>
                    {TAXONOMY[c].map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={subcategory === s}
                        onClick={() => setSubcategory(s)}
                        className={`min-h-9 rounded-full border px-3 text-[13px] ${
                          subcategory === s ? "border-accent bg-accent-soft font-semibold text-accent-strong" : "border-line"
                        }`}
                      >
                        {label(s)}
                      </button>
                    ))}
                  </fieldset>
                )}
              </div>
            ))}
            {process.env.NEXT_PUBLIC_POLICE_FORM_URL ? (
              <a
                href={process.env.NEXT_PUBLIC_POLICE_FORM_URL}
                className="flex items-center justify-between rounded-card border border-police bg-surface p-3.5 text-ink no-underline"
              >
                <span className="flex flex-col">
                  <span className="text-[15px] font-semibold">Police conduct</span>
                  <span className="text-[13px] text-muted">Extortion, harassment, unlawful arrest</span>
                </span>
                <span className="rounded-full bg-police px-2 py-0.5 text-[11px] font-bold text-white">Protected</span>
              </a>
            ) : (
              <div className="flex items-center justify-between rounded-card border border-line bg-surface p-3.5 text-muted">
                <span className="text-[15px] font-semibold">Police conduct</span>
                <span className="text-[13px]">Coming soon</span>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-2xl font-bold">Where and what?</h1>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              City
              <select
                value={city}
                onChange={(e) => setCity(e.target.value as City)}
                className="h-11 rounded-lg border border-line bg-surface px-3 font-normal"
              >
                <option value="lagos">Lagos</option>
                <option value="fct">FCT Abuja</option>
              </select>
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Location</span>
              <button
                type="button"
                onClick={locate}
                className="h-11 rounded-lg border border-line bg-surface text-sm font-semibold"
              >
                {locating ? "Finding you…" : location ? "Location captured ✓ (tap to update)" : "Use my current location"}
              </button>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Describe it
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                className="rounded-card border border-line bg-surface p-3 font-normal"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Phone for updates <span className="font-normal text-muted">Optional. Never shown publicly.</span>
              <input
                type="tel"
                inputMode="tel"
                placeholder="+2348012345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-11 rounded-lg border border-line bg-surface px-3 font-normal"
              />
            </label>
          </>
        )}

        {step === 3 && category && subcategory && (
          <>
            <h1 className="text-2xl font-bold">Check and submit</h1>
            <dl className="grid grid-cols-[110px_1fr] gap-2 rounded-card border border-line bg-surface p-4 text-sm">
              <dt className="text-muted">Category</dt>
              <dd>
                {CATEGORY_LABELS[category].title} › {label(subcategory)}
              </dd>
              <dt className="text-muted">City</dt>
              <dd>{city === "lagos" ? "Lagos" : "FCT Abuja"}</dd>
              <dt className="text-muted">Location</dt>
              <dd>{location ? "Captured from your phone" : "Missing"}</dd>
              <dt className="text-muted">Description</dt>
              <dd className="whitespace-pre-wrap">{description || "—"}</dd>
            </dl>
            <p className="text-xs text-muted">
              Your report is anonymous. Photo location data is removed and your phone number is never published.
            </p>
            <Turnstile
              resetKey={turnstileReset}
              onToken={setTurnstileToken}
              onError={() => setError("We couldn't confirm you're a person. Check your connection and reload the page.")}
            />
          </>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-[var(--cv-status-ack-bg)] p-3 text-sm text-[var(--cv-status-ack-fg)]">
            {error}
          </p>
        )}
      </main>

      <footer className="border-t border-line bg-surface px-5 pt-4 pb-7">
        {step === 1 && (
          <button
            type="button"
            disabled={!subcategory}
            onClick={() => setStep(2)}
            className="h-13 w-full rounded-card bg-accent font-semibold text-white disabled:opacity-40"
          >
            Continue
          </button>
        )}
        {step === 2 && (
          <button
            type="button"
            disabled={!location || description.trim().length === 0}
            onClick={() => setStep(3)}
            className="h-13 w-full rounded-card bg-accent font-semibold text-white disabled:opacity-40"
          >
            Review
          </button>
        )}
        {step === 3 && (
          <button
            type="button"
            disabled={submitting || (needsToken && !turnstileToken)}
            onClick={submit}
            className="h-13 w-full rounded-card bg-accent font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Submitting…" : needsToken && !turnstileToken ? "Checking you're not a bot…" : "Submit report"}
          </button>
        )}
      </footer>
    </div>
  );
}
