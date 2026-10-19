import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptContact, encryptContact } from "./contact-crypto";

const KEY = randomBytes(32).toString("base64");

describe("contact encryption", () => {
  it("round-trips and hides the number", () => {
    const envelope = encryptContact("+2348031234567", KEY);
    expect(envelope).not.toContain("8031234567");
    expect(decryptContact(envelope, KEY)).toBe("+2348031234567");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptContact("+2348031234567", KEY)).not.toBe(encryptContact("+2348031234567", KEY));
  });

  it("fails with the wrong key or a tampered envelope", () => {
    const envelope = encryptContact("+2348031234567", KEY);
    expect(() => decryptContact(envelope, randomBytes(32).toString("base64"))).toThrow();
    const tampered = Buffer.from(envelope, "base64");
    tampered[tampered.length - 1]! ^= 1;
    expect(() => decryptContact(tampered.toString("base64"), KEY)).toThrow();
  });

  it("rejects a key of the wrong length", () => {
    expect(() => encryptContact("+2348031234567", "c2hvcnQ=")).toThrow();
  });
});
