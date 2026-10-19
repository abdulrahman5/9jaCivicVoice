import { afterEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("siteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL, without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://civicvoice.ng/");
    vi.stubEnv("VERCEL_URL", "preview-abc.vercel.app");
    expect(siteUrl()).toBe("https://civicvoice.ng");
  });

  it("falls back to the Vercel branch URL, then the deployment URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_BRANCH_URL", "civicvoice-git-feat-x.vercel.app");
    vi.stubEnv("VERCEL_URL", "civicvoice-abc123.vercel.app");
    expect(siteUrl()).toBe("https://civicvoice-git-feat-x.vercel.app");
    vi.stubEnv("VERCEL_BRANCH_URL", "");
    expect(siteUrl()).toBe("https://civicvoice-abc123.vercel.app");
  });

  it("fails loudly when nothing is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_BRANCH_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(() => siteUrl()).toThrow("NEXT_PUBLIC_SITE_URL");
  });
});
