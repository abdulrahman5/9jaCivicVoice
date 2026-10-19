import { describe, expect, it } from "vitest";
import { MemoryStore, rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit, then blocks", async () => {
    const store = new MemoryStore();
    const opts = { limit: 2, windowMs: 60_000, store };
    expect((await rateLimit("ip:1", opts)).allowed).toBe(true);
    expect((await rateLimit("ip:1", opts)).allowed).toBe(true);
    expect((await rateLimit("ip:1", opts)).allowed).toBe(false);
    expect((await rateLimit("ip:2", opts)).allowed).toBe(true);
  });

  it("resets after the window", async () => {
    const store = new MemoryStore();
    await store.increment("k", 1000, 0);
    await store.increment("k", 1000, 500);
    expect(await store.increment("k", 1000, 1500)).toBe(1);
  });
});
