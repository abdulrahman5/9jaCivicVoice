import "server-only";
import { civicServiceClient } from "@civicvoice/db";
import type { LookupQuery } from "./schemas";

/** Polling-unit lookup (task E3). Server-only: the election schema is read with the service role. */

export interface Place {
  code: number;
  name: string;
}

export interface UnitSummary {
  code: string;
  name: string;
  active: boolean;
  state: Place;
  lga: Place;
  ward: Place;
  /** Only for "near me" answers. */
  distance_m?: number;
}

interface UnitRow {
  code: string;
  name: string;
  active: boolean;
  state_code: number;
  state_name: string;
  lga_code: number;
  lga_name: string;
  ward_code: number;
  ward_name: string;
  distance_m?: number;
}

const election = () => civicServiceClient().schema("election");

const toUnit = (r: UnitRow): UnitSummary => ({
  code: r.code,
  name: r.name,
  active: r.active,
  state: { code: r.state_code, name: r.state_name },
  lga: { code: r.lga_code, name: r.lga_name },
  ward: { code: r.ward_code, name: r.ward_name },
  ...(r.distance_m !== undefined ? { distance_m: r.distance_m } : {}),
});

async function rows<T>(promise: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type LookupResult =
  | { states: Place[] }
  | { lgas: Place[] }
  | { wards: Place[] }
  | { units: UnitSummary[] }
  | { unit: UnitSummary | null };

export async function lookup(query: LookupQuery): Promise<LookupResult> {
  const db = election();
  switch (query.mode) {
    case "states":
      return { states: await rows<Place>(db.from("states").select("code, name").order("code")) };
    case "lgas":
      return { lgas: await rows<Place>(db.from("lgas").select("code, name").eq("state_code", query.state).order("name")) };
    case "wards":
      return {
        wards: await rows<Place>(
          db.from("wards").select("code, name").eq("state_code", query.state).eq("lga_code", query.lga).order("name"),
        ),
      };
    case "units":
      return {
        units: (
          await rows<UnitRow>(
            db
              .from("unit_directory")
              .select("code, name, active, state_code, state_name, lga_code, lga_name, ward_code, ward_name")
              .eq("state_code", query.state)
              .eq("lga_code", query.lga)
              .eq("ward_code", query.ward)
              .eq("active", true)
              .order("code"),
          )
        ).map(toUnit),
      };
    case "code": {
      const found = await rows<UnitRow>(db.rpc("find_unit", { p_code: query.code }));
      return { unit: found[0] ? toUnit(found[0]) : null };
    }
    case "search":
      return {
        units: (
          await rows<UnitRow>(
            db.rpc("search_units", { p_query: query.q, p_state: query.state, p_lga: query.lga ?? null, p_limit: 20 }),
          )
        ).map(toUnit),
      };
    case "near":
      return {
        units: (await rows<UnitRow>(db.rpc("units_near", { p_lat: query.lat, p_lng: query.lng, p_limit: 5, p_within_m: 3000 }))).map(
          toUnit,
        ),
      };
  }
}
