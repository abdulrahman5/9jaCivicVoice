import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inecCodeForCvrState, CVR_STATES, type Snapshot, type StateSnapshot } from "./snapshot.ts";

/**
 * Reads a third-party scrape of INEC's CVR portal (one state_<cvrId>_<name>.json per
 * state, plus *_coords.json) into a snapshot. For development and testing only: the
 * source of record is our own crawl of the portal.
 */

interface ScrapedState {
  id: string;
  lgas: { code: string; name: string; wards: { code: string; name: string; pus: { id: string; code: string; name: string }[] }[] }[];
}

export function fromScraped(dir: string): Snapshot {
  const files = readdirSync(dir).filter((f) => /^state_\d+_.+\.json$/.test(f) && !f.endsWith("_coords.json"));
  const states: StateSnapshot[] = files.map((file) => {
    const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as ScrapedState;
    const code = inecCodeForCvrState(Number(raw.id));
    if (!code) throw new Error(`${file}: unknown CVR state id ${raw.id}`);
    let coords: Record<string, { lat: number | null; lng: number | null }> = {};
    try {
      coords = JSON.parse(readFileSync(join(dir, file.replace(/\.json$/, "_coords.json")), "utf8"));
    } catch {
      // no coordinates for this state
    }
    return {
      code,
      name: CVR_STATES.find((s) => s.inecCode === code)!.name,
      lgas: raw.lgas.map((l) => ({
        code: Number(l.code),
        name: l.name,
        wards: l.wards.map((w) => ({
          code: Number(w.code),
          name: w.name,
          units: w.pus.map((p) => ({
            unit_no: Number(p.code),
            name: p.name,
            lat: coords[p.id]?.lat ?? null,
            lng: coords[p.id]?.lng ?? null,
            inec_id: Number(p.id) || null,
          })),
        })),
      })),
    };
  });
  states.sort((a, b) => a.code - b.code);
  return { source: "third-party-scrape (development only)", fetched_at: new Date().toISOString(), states };
}
