import { z } from "zod";

/**
 * Query parameters for GET /api/election/units (task E3). Pure, so it's unit-tested.
 * The mode follows from which parameters are present:
 *   ?code=24/01/01/001             one unit
 *   ?q=school&state=24[&lga=1]     name search (a state is required)
 *   ?lat=6.6&lng=3.3               nearest units
 *   ?state=24&lga=1&ward=1         units in a ward
 *   ?state=24&lga=1                wards in an LGA
 *   ?state=24                      LGAs in a state
 *   (nothing)                      states
 */

const StateCode = z.coerce.number().int().min(1).max(37);
const LocalCode = z.coerce.number().int().min(1).max(99);

export type LookupQuery =
  | { mode: "code"; code: string }
  | { mode: "search"; q: string; state: number; lga?: number }
  | { mode: "near"; lat: number; lng: number }
  | { mode: "units"; state: number; lga: number; ward: number }
  | { mode: "wards"; state: number; lga: number }
  | { mode: "lgas"; state: number }
  | { mode: "states" };

export function parseLookupQuery(params: URLSearchParams): { ok: true; query: LookupQuery } | { ok: false; error: string } {
  const get = (k: string) => {
    const v = params.get(k)?.trim();
    return v ? v : undefined;
  };
  try {
    const code = get("code");
    if (code !== undefined) {
      return { ok: true, query: { mode: "code", code: z.string().max(30).parse(code) } };
    }
    const q = get("q");
    if (q !== undefined) {
      const state = get("state");
      if (!state) return { ok: false, error: "Choose a state to search in." };
      const lga = get("lga");
      return {
        ok: true,
        query: {
          mode: "search",
          q: z.string().min(3, "Type at least 3 letters.").max(80).parse(q),
          state: StateCode.parse(state),
          ...(lga ? { lga: LocalCode.parse(lga) } : {}),
        },
      };
    }
    const lat = get("lat");
    const lng = get("lng");
    if (lat !== undefined || lng !== undefined) {
      return {
        ok: true,
        query: { mode: "near", lat: z.coerce.number().min(4).max(14).parse(lat), lng: z.coerce.number().min(2.5).max(15).parse(lng) },
      };
    }
    const state = get("state");
    if (state === undefined) return { ok: true, query: { mode: "states" } };
    const lga = get("lga");
    if (lga === undefined) return { ok: true, query: { mode: "lgas", state: StateCode.parse(state) } };
    const ward = get("ward");
    if (ward === undefined) return { ok: true, query: { mode: "wards", state: StateCode.parse(state), lga: LocalCode.parse(lga) } };
    return { ok: true, query: { mode: "units", state: StateCode.parse(state), lga: LocalCode.parse(lga), ward: LocalCode.parse(ward) } };
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : undefined;
    return { ok: false, error: message && !message.startsWith("Too") && !message.startsWith("Invalid") ? message : "Check the details and try again." };
  }
}

/** How long a CDN may keep each kind of answer. The lists change only when INEC's list is re-imported. */
export const CACHE_SECONDS: Record<LookupQuery["mode"], number> = {
  states: 86_400,
  lgas: 86_400,
  wards: 86_400,
  units: 3_600,
  code: 3_600,
  search: 600,
  // A location is personal: answers to it are never cached by the CDN.
  near: 0,
};
