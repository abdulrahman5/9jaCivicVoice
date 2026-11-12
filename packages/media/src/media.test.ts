import { describe, expect, it } from "vitest";
import { fitWithin, padRegion, stripJpegMetadata } from "./index";

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

describe("stripJpegMetadata", () => {
  const seg = (marker: number, text: string) => {
    const payload = [...new TextEncoder().encode(text)];
    return [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
  };
  const jpeg = (extra: number[][] = []) =>
    new Uint8Array([0xff, 0xd8, ...seg(0xe0, "JFIF\0"), ...extra.flat(), ...seg(0xdb, "qt"), ...seg(0xda, "scan"), 0x12, 0x34, 0xff, 0xd9]);

  it("removes EXIF/GPS, XMP and comments, keeping the image", () => {
    const out = stripJpegMetadata(jpeg([seg(0xe1, "Exif\0\0GPS 6.6N 3.3E"), seg(0xe1, "<x:xmpmeta>"), seg(0xfe, "by Ada")]))!;
    expect(new TextDecoder("latin1").decode(out)).not.toMatch(/Exif|GPS|xmpmeta|Ada/);
    expect(out).toEqual(jpeg());
  });

  it("refuses anything that isn't a JPEG", () => {
    expect(stripJpegMetadata(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(stripJpegMetadata(jpeg().subarray(0, 9))).toBeNull();
  });
});
