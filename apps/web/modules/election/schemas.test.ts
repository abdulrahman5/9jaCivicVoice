import { describe, expect, it } from "vitest";
import { CACHE_SECONDS, parseLookupQuery } from "./schemas";

const parse = (qs: string) => parseLookupQuery(new URLSearchParams(qs));

describe("parseLookupQuery", () => {
  it("picks the mode from the parameters present", () => {
    expect(parse("")).toEqual({ ok: true, query: { mode: "states" } });
    expect(parse("state=24")).toEqual({ ok: true, query: { mode: "lgas", state: 24 } });
    expect(parse("state=24&lga=1")).toEqual({ ok: true, query: { mode: "wards", state: 24, lga: 1 } });
    expect(parse("state=24&lga=1&ward=3")).toEqual({ ok: true, query: { mode: "units", state: 24, lga: 1, ward: 3 } });
    expect(parse("code=24-1-1-1")).toEqual({ ok: true, query: { mode: "code", code: "24-1-1-1" } });
    expect(parse("q=school&state=24")).toEqual({ ok: true, query: { mode: "search", q: "school", state: 24 } });
    expect(parse("q=school&state=24&lga=5")).toEqual({ ok: true, query: { mode: "search", q: "school", state: 24, lga: 5 } });
    expect(parse("lat=6.6&lng=3.3")).toEqual({ ok: true, query: { mode: "near", lat: 6.6, lng: 3.3 } });
  });

  it("explains what's missing in plain words", () => {
    expect(parse("q=school")).toEqual({ ok: false, error: "Choose a state to search in." });
    expect(parse("q=ab&state=24")).toEqual({ ok: false, error: "Type at least 3 letters." });
  });

  it("refuses values outside Nigeria's ranges", () => {
    expect(parse("state=38").ok).toBe(false);
    expect(parse("state=24&lga=0").ok).toBe(false);
    expect(parse("lat=51.5&lng=-0.1").ok).toBe(false);
    expect(parse("lat=6.6").ok).toBe(false);
    expect(parse(`code=${"1".repeat(31)}`).ok).toBe(false);
  });

  it("never lets a CDN cache answers to someone's location", () => {
    expect(CACHE_SECONDS.near).toBe(0);
    expect(CACHE_SECONDS.states).toBeGreaterThan(0);
  });
});
