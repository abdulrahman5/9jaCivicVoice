import { countOf, type Snapshot, type Ward } from "./snapshot.ts";

/** Nigeria's bounding box; INEC's points outside it are mistakes. */
const NIGERIA = { minLat: 4, maxLat: 14, minLng: 2.5, maxLng: 15 };

export interface ValidationResult {
  snapshot: Snapshot;
  /** Things fixed or worth a look; none of them stop a load. */
  notes: string[];
  /** Things that make the snapshot unsafe to load. */
  errors: string[];
  counts: ReturnType<typeof countOf>;
}

/**
 * Cleans a snapshot before loading: merges wards listed twice under one code (INEC's
 * portal has at least one), drops duplicate units, nulls coordinates outside Nigeria,
 * trims names, and flags anything that makes it unsafe to load.
 */
export function validate(input: Snapshot): ValidationResult {
  const notes: string[] = [];
  const errors: string[] = [];
  let outside = 0;
  const seenStates = new Set<number>();

  const states = input.states.map((s) => {
    if (s.code < 1 || s.code > 37) errors.push(`state code ${s.code} is out of range`);
    if (seenStates.has(s.code)) errors.push(`state ${s.code} appears twice`);
    seenStates.add(s.code);

    const lgas = s.lgas.map((l) => {
      if (l.code < 1 || l.code > 99) errors.push(`${s.name}: LGA code ${l.code} is out of range`);
      const wards = new Map<number, Ward>();
      for (const w of l.wards) {
        if (w.code < 1 || w.code > 99) errors.push(`${s.name}/${l.name}: ward code ${w.code} is out of range`);
        const existing = wards.get(w.code);
        if (existing) {
          notes.push(`${s.name}/${l.name}: ward ${w.code} (${w.name}) is listed twice; merged`);
          existing.units.push(...w.units);
        } else {
          wards.set(w.code, { code: w.code, name: w.name.trim(), units: [...w.units] });
        }
      }
      for (const w of wards.values()) {
        const units = new Map<number, Ward["units"][number]>();
        for (const u of w.units) {
          if (u.unit_no < 1 || u.unit_no > 999) {
            errors.push(`${s.name}/${l.name}/${w.name}: unit number ${u.unit_no} is out of range`);
            continue;
          }
          if (units.has(u.unit_no)) {
            notes.push(`${s.name}/${l.name}/${w.name}: unit ${u.unit_no} is listed twice; kept the first`);
            continue;
          }
          let { lat, lng } = u;
          const inside =
            lat !== null && lng !== null &&
            lat >= NIGERIA.minLat && lat <= NIGERIA.maxLat && lng >= NIGERIA.minLng && lng <= NIGERIA.maxLng;
          if (!inside && (lat !== null || lng !== null)) {
            outside++;
            lat = null;
            lng = null;
          }
          units.set(u.unit_no, { ...u, name: u.name.trim() || `Polling unit ${u.unit_no}`, lat, lng });
        }
        w.units = [...units.values()].sort((a, b) => a.unit_no - b.unit_no);
      }
      return { code: l.code, name: l.name.trim(), wards: [...wards.values()].sort((a, b) => a.code - b.code) };
    });
    if (lgas.length === 0) errors.push(`${s.name}: no LGAs`);
    return { code: s.code, name: s.name, lgas };
  });

  if (outside) notes.push(`${outside} coordinates fell outside Nigeria and were dropped`);
  const snapshot = { ...input, states };
  return { snapshot, notes, errors, counts: countOf(snapshot) };
}
