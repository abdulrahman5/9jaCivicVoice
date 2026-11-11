"use client";

import { useEffect, useState } from "react";

/**
 * Lets someone choose their polling unit (task E3): by the code on their voter's card,
 * from state -> LGA -> ward -> unit lists, by searching names, or by units near them.
 * Used by the election report flow and "Find your polling unit".
 */

export interface Place {
  code: number;
  name: string;
}

export interface PollingUnit {
  code: string;
  name: string;
  active: boolean;
  state: Place;
  lga: Place;
  ward: Place;
  distance_m?: number;
}

type Tab = "code" | "lists" | "search" | "near";

const TABS: { tab: Tab; label: string }[] = [
  { tab: "code", label: "Code" },
  { tab: "lists", label: "Choose" },
  { tab: "search", label: "Search" },
  { tab: "near", label: "Near me" },
];

const input = "h-11 w-full rounded-lg border border-line bg-surface px-3";
const button = "h-11 rounded-card bg-accent px-4 font-semibold text-white disabled:opacity-50";

async function get<T>(params: Record<string, string | number | undefined>): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const qs = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (v === undefined || v === "" ? [] : [[k, String(v)]])),
  );
  try {
    const res = await fetch(`/api/election/units?${qs}`);
    return { ok: res.ok, data: await res.json() };
  } catch {
    return { ok: false, data: { error: "No connection. Check your internet and try again." } as T & { error?: string } };
  }
}

function useStates() {
  const [states, setStates] = useState<Place[]>([]);
  useEffect(() => {
    get<{ states: Place[] }>({}).then((r) => r.ok && setStates(r.data.states));
  }, []);
  return states;
}

export function UnitCard({ unit, onChange }: { unit: PollingUnit; onChange?: () => void }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border-2 border-accent bg-surface p-3.5">
      <p className="font-mono text-sm">{unit.code}</p>
      <p className="text-[15px] font-semibold">{unit.name}</p>
      <p className="text-[13px] text-muted">
        {unit.ward.name} ward · {unit.lga.name} · {unit.state.name}
      </p>
      {!unit.active && (
        <p role="alert" className="rounded-lg bg-[var(--cv-status-ack-bg)] p-2 text-[13px] text-[var(--cv-status-ack-fg)]">
          INEC no longer lists this polling unit. Check your voter&apos;s card and INEC&apos;s notices for where to vote.
        </p>
      )}
      {onChange && (
        <button type="button" onClick={onChange} className="self-start text-[13px] font-semibold text-accent">
          Choose a different polling unit
        </button>
      )}
    </div>
  );
}

/** Rounded, because unit locations are approximate. */
const distance = (m: number) =>
  m < 50 ? "under 50 m away" : m < 1000 ? `about ${Math.round(m / 50) * 50} m away` : `about ${(m / 1000).toFixed(1)} km away`;

function UnitList({ units, onSelect, empty }: { units: PollingUnit[]; onSelect: (u: PollingUnit) => void; empty: string }) {
  if (!units.length) return <p className="text-[13px] text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {units.map((u) => (
        <li key={u.code}>
          <button
            type="button"
            onClick={() => onSelect(u)}
            className="flex w-full flex-col items-start gap-0.5 rounded-card border border-line bg-surface p-3 text-left"
          >
            <span className="text-[14px] font-semibold">{u.name}</span>
            <span className="text-[12px] text-muted">
              <span className="font-mono">{u.code}</span> · {u.ward.name} · {u.lga.name}
              {u.distance_m !== undefined && ` · ${distance(u.distance_m)}`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ByCode({ onSelect }: { onSelect: (u: PollingUnit) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const r = await get<{ unit: PollingUnit | null }>({ code });
        setBusy(false);
        if (r.ok && r.data.unit) onSelect(r.data.unit);
        else setError(r.data.error ?? "No polling unit with that code.");
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Polling unit code
        <span className="font-normal text-muted">On your voter&apos;s card (PVC), e.g. 24/01/01/001</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="24/01/01/001"
          className={`${input} font-mono`}
        />
      </label>
      <button type="submit" disabled={busy || code.replace(/\D/g, "").length < 4} className={button}>
        {busy ? "Finding…" : "Find"}
      </button>
      {error && <p role="alert" className="text-[13px] text-[var(--cv-status-ack-fg)]">{error}</p>}
    </form>
  );
}

function ByLists({ onSelect, states }: { onSelect: (u: PollingUnit) => void; states: Place[] }) {
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [ward, setWard] = useState("");
  const [lgas, setLgas] = useState<Place[]>([]);
  const [wards, setWards] = useState<Place[]>([]);
  const [units, setUnits] = useState<PollingUnit[] | null>(null);

  useEffect(() => {
    setLgas([]);
    if (state) get<{ lgas: Place[] }>({ state }).then((r) => r.ok && setLgas(r.data.lgas));
  }, [state]);
  useEffect(() => {
    setWards([]);
    if (state && lga) get<{ wards: Place[] }>({ state, lga }).then((r) => r.ok && setWards(r.data.wards));
  }, [state, lga]);
  useEffect(() => {
    setUnits(null);
    if (state && lga && ward) get<{ units: PollingUnit[] }>({ state, lga, ward }).then((r) => r.ok && setUnits(r.data.units));
  }, [state, lga, ward]);

  const select = (label: string, value: string, set: (v: string) => void, options: Place[], disabled: boolean) => (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {label}
      <select value={value} onChange={(e) => set(e.target.value)} disabled={disabled} className={input}>
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-2">
      {select("State", state, (v) => (setState(v), setLga(""), setWard("")), states, false)}
      {select("LGA", lga, (v) => (setLga(v), setWard("")), lgas, !state)}
      {select("Ward", ward, setWard, wards, !lga)}
      {units && <UnitList units={units} onSelect={onSelect} empty="No polling units listed for this ward." />}
    </div>
  );
}

function BySearch({ onSelect, states }: { onSelect: (u: PollingUnit) => void; states: Place[] }) {
  const [state, setState] = useState("");
  const [q, setQ] = useState("");
  const [units, setUnits] = useState<PollingUnit[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    if (!state || q.trim().length < 3) {
      setUnits(null);
      return;
    }
    const t = setTimeout(async () => {
      const r = await get<{ units: PollingUnit[] }>({ q: q.trim(), state });
      if (r.ok) setUnits(r.data.units);
      else setError(r.data.error ?? "Search failed.");
    }, 300);
    return () => clearTimeout(t);
  }, [state, q]);

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        State
        <select value={state} onChange={(e) => setState(e.target.value)} className={input}>
          <option value="">Choose…</option>
          {states.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Name of the polling unit or a place near it
        <input value={q} onChange={(e) => setQ(e.target.value)} disabled={!state} placeholder="e.g. St. Joseph school" className={input} />
      </label>
      {error && <p role="alert" className="text-[13px] text-[var(--cv-status-ack-fg)]">{error}</p>}
      {units && <UnitList units={units} onSelect={onSelect} empty="No match. Try another word, or choose from the lists." />}
    </div>
  );
}

function NearMe({ onSelect }: { onSelect: (u: PollingUnit) => void }) {
  const [units, setUnits] = useState<PollingUnit[] | null>(null);
  const [status, setStatus] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted">
        Your location is used only to find polling units near you. It isn&apos;t stored. Locations of polling units are
        approximate.
      </p>
      <button
        type="button"
        className={button}
        onClick={() => {
          if (!navigator.geolocation) return setStatus("Your browser can't share a location. Use one of the other options.");
          setStatus("Finding your location…");
          navigator.geolocation.getCurrentPosition(
            async (p) => {
              const r = await get<{ units: PollingUnit[] }>({ lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5) });
              setStatus(r.ok ? "" : (r.data.error ?? "Lookup failed."));
              if (r.ok) setUnits(r.data.units);
            },
            () => setStatus("Location unavailable. Use one of the other options."),
            { timeout: 15000, enableHighAccuracy: true },
          );
        }}
      >
        Use my location
      </button>
      {status && <p className="text-[13px] text-muted">{status}</p>}
      {units && <UnitList units={units} onSelect={onSelect} empty="No polling units found within 3 km. Use one of the other options." />}
    </div>
  );
}

export function PollingUnitPicker({ onSelect }: { onSelect: (unit: PollingUnit) => void }) {
  const [tab, setTab] = useState<Tab>("code");
  const states = useStates();
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="How to find your polling unit" className="grid grid-cols-4 gap-1 rounded-card bg-fill p-1">
        {TABS.map((t) => (
          <button
            key={t.tab}
            role="tab"
            type="button"
            aria-selected={tab === t.tab}
            onClick={() => setTab(t.tab)}
            className={`min-h-9 rounded-lg text-[13px] font-semibold ${tab === t.tab ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "code" && <ByCode onSelect={onSelect} />}
      {tab === "lists" && <ByLists onSelect={onSelect} states={states} />}
      {tab === "search" && <BySearch onSelect={onSelect} states={states} />}
      {tab === "near" && <NearMe onSelect={onSelect} />}
    </div>
  );
}
