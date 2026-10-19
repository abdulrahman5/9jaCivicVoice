import { describe, expect, it } from "vitest";
import { signAgencyToken, verifyAgencyToken } from "./agency-tokens";

const KEY = "test-agency-token-key";
const input = { agencyId: "agency-1", issueId: "issue-1" };

describe("agency tokens", () => {
  it("round-trips a valid token", () => {
    const { token } = signAgencyToken(input, KEY);
    const result = verifyAgencyToken(token, KEY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload).toMatchObject(input);
  });

  it("rejects a token signed with another key", () => {
    const { token } = signAgencyToken(input, "other-key");
    expect(verifyAgencyToken(token, KEY)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a tampered payload", () => {
    const { token } = signAgencyToken(input, KEY);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...input, issueId: "issue-2", exp: 9e9, jti: "x" })).toString(
      "base64url",
    );
    expect(verifyAgencyToken(`${forged}.${sig}`, KEY)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an expired token", () => {
    const now = Date.now();
    const { token } = signAgencyToken(input, KEY, now, 60);
    expect(verifyAgencyToken(token, KEY, now + 61_000)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects malformed input", () => {
    expect(verifyAgencyToken("not-a-token", KEY)).toEqual({ ok: false, reason: "malformed" });
  });
});
