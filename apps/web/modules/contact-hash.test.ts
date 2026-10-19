import { describe, expect, it } from "vitest";
import { hashContact, normalisePhone } from "./contact-hash";

const PEPPER = "x".repeat(32);

describe("normalisePhone", () => {
  it("normalises the formats people actually type", () => {
    expect(normalisePhone("08031234567")).toBe("+2348031234567");
    expect(normalisePhone("+234 803 123 4567")).toBe("+2348031234567");
    expect(normalisePhone("2348031234567")).toBe("+2348031234567");
  });
});

describe("hashContact", () => {
  it("gives the same hash for the same number in any format", () => {
    expect(hashContact("08031234567", PEPPER)).toBe(hashContact("+2348031234567", PEPPER));
  });

  it("differs per pepper", () => {
    expect(hashContact("08031234567", PEPPER)).not.toBe(hashContact("08031234567", "y".repeat(32)));
  });

  it("refuses a weak pepper", () => {
    expect(() => hashContact("08031234567", "short")).toThrow();
  });
});
