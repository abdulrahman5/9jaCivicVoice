"use client";

import Link from "next/link";
import { useState } from "react";
import { PhotoEditor, openPhoto, photoToJpeg, type Photo } from "@/components/election/PhotoBlur";
import { PollingUnitPicker, UnitCard, type PollingUnit } from "@/components/election/PollingUnitPicker";
import { Turnstile, turnstileSiteKey } from "@/components/Turnstile";

/** The web election report (task E4): polling unit → what happened → details and photos. */

export interface FlowCategory {
  id: string;
  stage: "opening" | "accreditation" | "voting" | "counting" | "any";
  label: string;
}

const STAGES: { stage: FlowCategory["stage"]; title: string }[] = [
  { stage: "opening", title: "Opening" },
  { stage: "accreditation", title: "Accreditation" },
  { stage: "voting", title: "Voting" },
  { stage: "counting", title: "Counting and results" },
  { stage: "any", title: "Anything else" },
];

const DEVICE_KEY = "cv-election-device";
const MAX_PHOTOS = 3;

/** A random id kept in this browser, so one person can't report the same thing twice. Never stored by us as is. */
function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    // Private mode: a fresh id per visit still works, it just can't catch repeats across visits.
    return crypto.randomUUID();
  }
}

const primary = "h-12 rounded-card bg-accent px-4 font-semibold text-white disabled:opacity-50";

export function ElectionReportFlow({ electionId, electionName, categories }: { electionId: string; electionName: string; categories: FlowCategory[] }) {
  const [unit, setUnit] = useState<PollingUnit | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosConfirmed, setPhotosConfirmed] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ ref: string; label: string } | null>(null);
  const step = !unit ? 1 : !category ? 2 : 3;
  const chosen = categories.find((c) => c.id === category);
  const needsToken = Boolean(turnstileSiteKey);

  async function submit() {
    if (!unit || !category) return;
    setSubmitting(true);
    setError("");
    const report = { electionId, puCode: unit.code, category, description, deviceId: deviceId(), photosConfirmed, turnstileToken };
    let res: Response;
    try {
      if (photos.length) {
        const form = new FormData();
        form.append("report", JSON.stringify(report));
        for (const p of photos) form.append("photos", await photoToJpeg(p), "photo.jpg");
        res = await fetch("/api/election/reports", { method: "POST", body: form });
      } else {
        res = await fetch("/api/election/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(report) });
      }
    } catch {
      setSubmitting(false);
      return setError("No connection. Check your internet and try again.");
    }
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTurnstileReset((n) => n + 1);
      return setError(data.error ?? "Something went wrong. Please try again.");
    }
    setDone(data);
  }

  if (done && unit) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Thank you</h1>
        <p className="text-[15px]">
          Your report about <strong>{chosen?.label.toLowerCase()}</strong> at {unit.name} is in.
          {done.label === "corroborated" && " Others at this polling unit have reported the same thing."}
        </p>
        <div className="rounded-card border border-line bg-surface p-4 text-center">
          <p className="text-[13px] text-muted">Your reference</p>
          <p className="font-mono text-2xl font-bold">{done.ref}</p>
        </div>
        <Link href={`/elections/track?ref=${done.ref}`} className="text-[15px] font-semibold">
          Check this report later
        </Link>
        <button
          type="button"
          className={primary}
          onClick={() => {
            setDone(null);
            setCategory(null);
            setDescription("");
            setPhotos([]);
            setPhotosConfirmed(false);
          }}
        >
          Report something else at this polling unit
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex gap-1.5" aria-label={`Step ${step} of 3`}>
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-1 flex-1 rounded ${n <= step ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
        <p className="font-mono text-xs text-muted">
          {electionName.toUpperCase()} · STEP {step} OF 3
        </p>
      </div>

      {!unit ? (
        <>
          <h1 className="text-2xl font-bold">Which polling unit?</h1>
          <PollingUnitPicker onSelect={setUnit} />
        </>
      ) : (
        <UnitCard unit={unit} onChange={() => (setUnit(null), setCategory(null))} />
      )}

      {unit && !category && (
        <>
          <h1 className="text-2xl font-bold">What happened?</h1>
          {STAGES.map(({ stage, title }) => {
            const items = categories.filter((c) => c.stage === stage);
            if (!items.length) return null;
            return (
              <fieldset key={stage} className="flex flex-col gap-2">
                <legend className="mb-1 text-[13px] font-semibold text-muted">{title}</legend>
                {items.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className="rounded-card border border-line bg-surface p-3.5 text-left text-[15px]"
                  >
                    {c.label}
                  </button>
                ))}
              </fieldset>
            );
          })}
        </>
      )}

      {unit && chosen && (
        <>
          <div className="flex items-center justify-between rounded-card bg-fill p-3 text-[15px]">
            <span className="font-semibold">{chosen.label}</span>
            <button type="button" onClick={() => setCategory(null)} className="text-[13px] font-semibold text-accent">
              Change
            </button>
          </div>

          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            What happened? {chosen.id === "other" ? "" : <span className="font-normal text-muted">Optional</span>}
            <span className="font-normal text-muted">Don&apos;t name private people or include phone numbers.</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={1000}
              className="rounded-lg border border-line bg-surface p-3 font-normal"
            />
          </label>

          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold">
              Photos <span className="font-normal text-muted">Optional, up to {MAX_PHOTOS}</span>
            </h2>
            <p role="note" className="rounded-lg bg-[var(--cv-status-ack-bg)] p-3 text-[13px] text-[var(--cv-status-ack-fg)]">
              <strong>Never photograph a ballot paper or anyone in the voting cubicle.</strong> It&apos;s against
              INEC&apos;s rules and can put people at risk. Photos of queues, materials, damage and posted result sheets
              are fine, if it&apos;s safe to take them.
            </p>
            {photos.map((p) => (
              <PhotoEditor
                key={p.id}
                photo={p}
                onChange={(next) => setPhotos((all) => all.map((x) => (x.id === next.id ? next : x)))}
                onRemove={() => setPhotos((all) => all.filter((x) => x.id !== p.id))}
              />
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="flex h-11 cursor-pointer items-center justify-center rounded-card border border-line bg-surface font-semibold">
                Add a photo
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      const photo = await openPhoto(file);
                      setPhotos((all) => [...all, photo]);
                    } catch {
                      setError("That photo couldn't be opened. Try another.");
                    }
                  }}
                />
              </label>
            )}
            {photos.length > 0 && (
              <label className="flex items-start gap-2 text-[14px]">
                <input type="checkbox" checked={photosConfirmed} onChange={(e) => setPhotosConfirmed(e.target.checked)} className="mt-1 size-5" />
                No ballot papers in my photos, and faces, number plates and name tags are blurred.
              </label>
            )}
          </section>

          <Turnstile onToken={setTurnstileToken} onError={() => setError("The security check didn't load. Refresh and try again.")} resetKey={turnstileReset} />
          {error && (
            <p role="alert" className="rounded-lg bg-[var(--cv-status-ack-bg)] p-3 text-[14px] text-[var(--cv-status-ack-fg)]">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={
              submitting ||
              (needsToken && !turnstileToken) ||
              (photos.length > 0 && !photosConfirmed) ||
              (chosen.id === "other" && description.trim().length < 5)
            }
            className={primary}
          >
            {submitting ? "Sending…" : "Send report"}
          </button>
          <p className="text-[12px] text-muted">
            Anonymous: we don&apos;t ask for your name or number. In danger right now? Call 112.
          </p>
        </>
      )}
    </div>
  );
}
