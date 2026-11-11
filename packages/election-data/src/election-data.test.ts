import { describe, expect, it, vi } from "vitest";
import { crossCheck, parseCsv } from "./crosscheck.ts";
import { crawl, CvrClient } from "./cvr.ts";
import { loadSnapshot } from "./load.ts";
import { CVR_STATES, inecCodeForCvrState, parseLabel, puCode, type Snapshot } from "./snapshot.ts";
import { validate } from "./validate.ts";

describe("INEC numbering", () => {
  it("maps the CVR portal's state ids to INEC's codes: FCT last, the rest shift down after it", () => {
    expect(inecCodeForCvrState(1)).toBe(1); // Abia
    expect(inecCodeForCvrState(14)).toBe(14); // Enugu
    expect(inecCodeForCvrState(15)).toBe(37); // FCT
    expect(inecCodeForCvrState(16)).toBe(15); // Gombe
    expect(inecCodeForCvrState(25)).toBe(24); // Lagos
    expect(inecCodeForCvrState(37)).toBe(36); // Zamfara
    expect(new Set(CVR_STATES.map((s) => s.inecCode)).size).toBe(37);
  });

  it("reads portal labels and builds INEC's code", () => {
    expect(parseLabel("01 - AGEGE")).toEqual({ code: 1, name: "AGEGE" });
    expect(parseLabel(" 012 -  15, SHOMIDE STREET ")).toEqual({ code: 12, name: "15, SHOMIDE STREET" });
    expect(parseLabel("AGEGE")).toBeNull();
    expect(puCode(24, 1, 1, 3)).toBe("24/01/01/003");
  });
});

/** A fake CVR portal: one state (Lagos, CVR id 25) with one LGA, one ward and two units. */
function fakePortal(options: { failFirst?: boolean } = {}) {
  let failed = false;
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (options.failFirst && !failed) {
      failed = true;
      return new Response("busy", { status: 503 });
    }
    const q = decodeURIComponent(url);
    if (q.includes("/lgas/") && q.includes("[state_id]=25")) return Response.json([{ "506": "01 - AGEGE", "0": "Select", selected: "" }]);
    if (q.includes("/wards/") && q.includes("=506")) return Response.json({ "5759": "01 - ISALE/IDIMANGORO" });
    if (q.includes("/pus/") && q.includes("=5759")) {
      return Response.json([{ "76565": "002 - 15, SHOMIDE STREET", "76564": "001 - ST. JOSEPH SECONDARY SCHOOL" }]);
    }
    if (url.endsWith("/pu_locator/index")) {
      const body = String(init?.body);
      return body.includes("76564")
        ? new Response(null, { status: 302, headers: { location: "https://maps.google.com/maps?q=6.6098,3.3292" } })
        : new Response(null, { status: 302, headers: { location: "https://maps.google.com/maps?q=" } });
    }
    return Response.json({});
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

describe("CvrClient and crawl", () => {
  it("crawls a state into INEC's numbering, with coordinates where INEC has them", async () => {
    const portal = fakePortal();
    const client = new CvrClient({ fetchImpl: portal.fetchImpl, delayMs: 0 });
    const snapshot = await crawl(client, { states: [24], coordinates: "all" });

    expect(snapshot.source).toBe("inec-cvr");
    expect(snapshot.states).toHaveLength(1);
    const state = snapshot.states[0]!;
    expect(state).toMatchObject({ code: 24, name: "Lagos" });
    const ward = state.lgas[0]!.wards[0]!;
    expect(ward).toMatchObject({ code: 1, name: "ISALE/IDIMANGORO" });
    expect(ward.units).toEqual([
      { unit_no: 1, name: "ST. JOSEPH SECONDARY SCHOOL", lat: 6.6098, lng: 3.3292, inec_id: 76564 },
      { unit_no: 2, name: "15, SHOMIDE STREET", lat: null, lng: null, inec_id: 76565 },
    ]);
    // Asked the portal for Lagos by its CVR id (25), not its INEC code (24).
    expect(portal.calls.some((u) => decodeURIComponent(u).includes("[state_id]=25"))).toBe(true);
  });

  it("skips coordinates unless asked, or asks only for units without them", async () => {
    const portal = fakePortal();
    await crawl(new CvrClient({ fetchImpl: portal.fetchImpl, delayMs: 0 }), { states: [24] });
    expect(portal.calls.some((u) => u.endsWith("/pu_locator/index"))).toBe(false);

    const second = fakePortal();
    await crawl(new CvrClient({ fetchImpl: second.fetchImpl, delayMs: 0 }), {
      states: [24],
      coordinates: (code) => code === "24/01/01/002",
    });
    expect(second.calls.filter((u) => u.endsWith("/pu_locator/index"))).toHaveLength(1);
  });

  it("retries when the portal is busy, and identifies itself", async () => {
    const portal = fakePortal({ failFirst: true });
    const client = new CvrClient({ fetchImpl: portal.fetchImpl, delayMs: 0 });
    expect(await client.lgas(25)).toEqual([{ id: 506, code: 1, name: "AGEGE" }]);
    const init = (portal.fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/CivicVoiceNG/);
  });

  it("never has more requests in flight than its concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = (async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return Response.json({ "1": "01 - X" });
    }) as unknown as typeof fetch;
    const client = new CvrClient({ fetchImpl, concurrency: 3, delayMs: 0 });
    await Promise.all(Array.from({ length: 12 }, (_, i) => client.units(i)));
    expect(peak).toBe(3);
  });
});

const snapshot = (): Snapshot => ({
  source: "inec-cvr",
  fetched_at: "2026-12-15T00:00:00Z",
  states: [
    {
      code: 7,
      name: "Benue",
      lgas: [
        {
          code: 7,
          name: "GUMA",
          wards: [
            { code: 9, name: "MBAIKYAAN", units: [{ unit_no: 1, name: " ST. MARY ", lat: 7.7, lng: 8.6, inec_id: 1 }] },
            // INEC's portal really lists this ward twice; the second copy is empty.
            { code: 9, name: "MBAIKYAAN", units: [] },
            {
              code: 10,
              name: "MBADWEM",
              units: [
                { unit_no: 1, name: "MARKET", lat: 51.5, lng: -0.1, inec_id: 2 },
                { unit_no: 1, name: "MARKET (again)", lat: null, lng: null, inec_id: 3 },
              ],
            },
          ],
        },
      ],
    },
  ],
});

describe("validate", () => {
  it("merges duplicate wards, drops duplicate units and coordinates outside Nigeria, and trims", () => {
    const r = validate(snapshot());
    expect(r.errors).toEqual([]);
    expect(r.counts).toMatchObject({ lgas: 1, wards: 2, units: 2, withCoordinates: 1 });
    const wards = r.snapshot.states[0]!.lgas[0]!.wards;
    expect(wards[0]!.units[0]!.name).toBe("ST. MARY");
    expect(wards[1]!.units[0]).toMatchObject({ name: "MARKET", lat: null, lng: null });
    expect(r.notes.join(" ")).toMatch(/listed twice; merged/);
    expect(r.notes.join(" ")).toMatch(/outside Nigeria/);
  });

  it("flags what would make a load unsafe", () => {
    const bad = snapshot();
    bad.states[0]!.code = 40;
    bad.states.push({ code: 1, name: "Abia", lgas: [] });
    expect(validate(bad).errors).toEqual(["state code 40 is out of range", "Abia: no LGAs"]);
  });
});

describe("crossCheck", () => {
  it("parses quoted CSV and compares codes, names and per-state counts", () => {
    const rows = parseCsv('code,location\n07/07/09/001,"st. mary, gboko road"\n07/07/09/002,"new ""unit"""\n');
    expect(rows).toEqual([
      { code: "07/07/09/001", location: "st. mary, gboko road" },
      { code: "07/07/09/002", location: 'new "unit"' },
    ]);
    const cc = crossCheck(validate(snapshot()).snapshot, rows.map((r) => ({ code: r.code!, name: r.location! })));
    expect(cc).toMatchObject({ ours: 2, theirs: 2, onlyOurs: ["07/07/10/001"], onlyTheirs: ["07/07/09/002"], nameDifferences: 0 });
    expect(cc.stateDifferences).toEqual({});
  });
});

describe("loadSnapshot", () => {
  it("loads LGA by LGA, passes the deactivate flag, and adds up the results", async () => {
    const importLga = vi.fn(async (_state: number, _lga: unknown, _deactivate: boolean) => ({ inserted: 2, updated: 1, unchanged: 0, deactivated: 0 }));
    const total = await loadSnapshot(validate(snapshot()).snapshot, importLga, { deactivateMissing: true });
    expect(importLga).toHaveBeenCalledTimes(1);
    expect(importLga.mock.calls[0]![0]).toBe(7);
    expect(importLga.mock.calls[0]![2]).toBe(true);
    expect(total).toEqual({ inserted: 2, updated: 1, unchanged: 0, deactivated: 0 });
  });
});
