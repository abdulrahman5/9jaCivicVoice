import { describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "./turnstile";

const ok = (body: unknown) => vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify(body)));

describe("verifyTurnstile", () => {
  it("fails closed in production when no secret is configured", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await verifyTurnstile("token", "1.2.3.4", { secret: "", production: true })).toBe(false);
    spy.mockRestore();
  });

  it("skips the check in development when no secret is configured", async () => {
    expect(await verifyTurnstile(undefined, "1.2.3.4", { secret: "", production: false })).toBe(true);
  });

  it("requires a token when a secret is configured", async () => {
    const fetchImpl = ok({ success: true });
    expect(await verifyTurnstile(undefined, "1.2.3.4", { secret: "s", fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts a token Cloudflare confirms, sending secret, token and IP", async () => {
    const fetchImpl = ok({ success: true });
    expect(await verifyTurnstile("tok", "1.2.3.4", { secret: "s", fetchImpl })).toBe(true);
    const body = fetchImpl.mock.calls[0]![1]!.body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({ secret: "s", response: "tok", remoteip: "1.2.3.4" });
  });

  it("rejects a token Cloudflare refuses", async () => {
    expect(await verifyTurnstile("tok", "1.2.3.4", { secret: "s", fetchImpl: ok({ success: false }) })).toBe(false);
  });

  it("fails closed when Cloudflare can't be reached", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await verifyTurnstile("tok", "1.2.3.4", { secret: "s", fetchImpl })).toBe(false);
  });
});
