import { describe, expect, it } from "vitest";
import { parsePoint } from "./data";

describe("parsePoint", () => {
  it("reads GeoJSON", () => {
    expect(parsePoint({ type: "Point", coordinates: [3.345, 6.6] })).toEqual({ lat: 6.6, lng: 3.345 });
  });

  it("reads EWKB hex with an SRID, as PostgREST returns geography", () => {
    // SELECT ST_SetSRID(ST_MakePoint(3.345, 6.6), 4326)::geography
    expect(parsePoint("0101000020E6100000C3F5285C8FC20A406666666666661A40")).toEqual({ lat: 6.6, lng: 3.345 });
  });

  it("returns null for nothing", () => {
    expect(parsePoint(null)).toBeNull();
  });
});
