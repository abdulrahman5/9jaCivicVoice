import { describe, expect, it } from "vitest";
import { fitWithin, padRegion } from "./index";

describe("fitWithin", () => {
  it("leaves small images alone", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("scales the longest side down to the limit", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });
});

describe("padRegion", () => {
  it("pads a region and clamps it to the image", () => {
    const r = padRegion({ x: 0, y: 10, width: 100, height: 50 }, 110, 100);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBeLessThanOrEqual(110);
    expect(r.height).toBe(70);
  });
});
