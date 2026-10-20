import { describe, expect, it } from "vitest";
import {
  areasByMonth,
  cellRect,
  forwardingSummary,
  mapCells,
  mapViewBox,
  maxBand,
  monthLabel,
  type AreaRow,
} from "./shape";

const area = (over: Partial<AreaRow>): AreaRow => ({
  period_start: "2026-09-01",
  city: "lagos",
  grid_cell: "659:334",
  kind: "misconduct",
  incident_type: "money_demanded",
  band: "3-5",
  lat: 6.595,
  lng: 3.345,
  lga: "Ikeja",
  ...over,
});

describe("bands", () => {
  it("takes the highest band, never a sum", () => {
    expect(maxBand(["3-5", "11-25", "6-10"])).toBe("11-25");
    expect(maxBand(["3-5", "3-5"])).toBe("3-5");
  });
});

describe("map", () => {
  it("places a cell as a 0.01° square with y as negated latitude", () => {
    const r = cellRect("659:334");
    expect(r.x).toBeCloseTo(3.34);
    expect(r.y).toBeCloseTo(-6.6);
    expect(r.size).toBe(0.01);
  });

  it("merges types in one cell and shades by the highest band", () => {
    const cells = mapCells([
      area({ band: "3-5" }),
      area({ incident_type: "violence", band: "6-10" }),
      area({ grid_cell: "660:335", band: "3-5" }),
    ]);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ grid_cell: "659:334", band: "6-10" });
    expect(cells[0]!.entries).toHaveLength(2);
  });

  it("frames the outlines and cells, or nothing when there's neither", () => {
    const box = mapViewBox(
      [{ name: "Ikeja", svg_path: "", min_lng: 3.3, min_lat: 6.57, max_lng: 3.38, max_lat: 6.64, label_lng: 3.34, label_lat: 6.6 }],
      mapCells([area({})]),
    );
    expect(box!.x).toBeLessThan(3.3);
    expect(box!.y).toBeLessThan(-6.64);
    expect(box!.width).toBeGreaterThan(0.08);
    expect(mapViewBox([], [])).toBeNull();
  });
});

describe("areasByMonth", () => {
  it("counts distinct areas per published month, keeping empty months", () => {
    const rows = areasByMonth(
      ["2026-09-01", "2026-07-01", "2026-08-01"],
      [area({}), area({ incident_type: "violence" }), area({ grid_cell: "660:335" }), area({ period_start: "2026-08-01" })],
    );
    expect(rows).toEqual([
      { period: "2026-07-01", areas: 0 },
      { period: "2026-08-01", areas: 1 },
      { period: "2026-09-01", areas: 2 },
    ]);
  });
});

describe("forwardingSummary", () => {
  it("adds up months per recipient and works out the response rate", () => {
    const [cru, psc] = forwardingSummary([
      { period_start: "2026-08-01", recipient: "cru", forwarded: 3, acknowledged: 1, action_reported: 0, no_response: 1 },
      { period_start: "2026-09-01", recipient: "cru", forwarded: 5, acknowledged: 2, action_reported: 1, no_response: 0 },
    ]);
    expect(cru).toEqual({ recipient: "cru", forwarded: 8, responded: 4, no_response: 1, awaiting: 3, response_rate: 50 });
    expect(psc).toMatchObject({ forwarded: 0, response_rate: null });
  });
});

it("labels months in words", () => {
  expect(monthLabel("2026-09-01")).toBe("September 2026");
});
