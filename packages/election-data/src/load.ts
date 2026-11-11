import type { Lga, Snapshot } from "./snapshot.ts";

export interface LgaResult {
  inserted: number;
  updated: number;
  unchanged: number;
  deactivated: number;
}

/** Calls election.import_lga for one LGA. Injected so loading can be tested without a database. */
export type ImportLga = (stateCode: number, lga: Lga, deactivateMissing: boolean) => Promise<LgaResult>;

/**
 * Loads a validated snapshot, one LGA per call (the largest state is ~13,000 units, too
 * much for one request). Inserts and updates only; with deactivateMissing, units INEC no
 * longer lists are marked inactive, LGA by LGA, and only in LGAs this snapshot covers.
 */
export async function loadSnapshot(
  snapshot: Snapshot,
  importLga: ImportLga,
  options: { deactivateMissing?: boolean; log?: (message: string) => void } = {},
) {
  const total: LgaResult = { inserted: 0, updated: 0, unchanged: 0, deactivated: 0 };
  for (const state of snapshot.states) {
    for (const lga of state.lgas) {
      const r = await importLga(state.code, lga, options.deactivateMissing ?? false);
      total.inserted += r.inserted;
      total.updated += r.updated;
      total.unchanged += r.unchanged;
      total.deactivated += r.deactivated;
    }
    options.log?.(`${state.name}: loaded ${state.lgas.length} LGAs`);
  }
  return total;
}
