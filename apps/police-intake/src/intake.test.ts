import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { StatusCode } from "@civicvoice/validation";
import { b64, generateStatusCode, hashStatusCode, importPublicKey, seal, statusLookup, unb64, unseal, WORDS } from "./crypto";
import worker, { handleMessage, handleStatus, handleSubmit, type Env } from "./index";
import { cellCentre, gridCell } from "./privacy";
import { FORM_HTML, FORM_JS, SHARED_CSS, STATUS_HTML, STATUS_JS, withSiteKey } from "./form";

async function keyPair() {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["wrapKey", "unwrapKey"],
  )) as CryptoKeyPair;
  const spki = b64(await crypto.subtle.exportKey("spki", pair.publicKey));
  return { spki, privateKey: pair.privateKey };
}

describe("grid privacy", () => {
  it("puts nearby points in the same ~1 km cell", () => {
    expect(gridCell(6.6018, 3.3515)).toBe(gridCell(6.6049, 3.3561));
  });

  it("never returns the exact point", () => {
    const centre = cellCentre(gridCell(6.60183, 3.35151));
    expect(centre).not.toEqual({ lat: 6.60183, lng: 3.35151 });
    expect(Math.abs(centre.lat - 6.60183)).toBeLessThan(0.01);
  });
});

describe("officer details encryption", () => {
  it("round-trips with the private key, and the ciphertext hides the text", async () => {
    const { spki, privateKey } = await keyPair();
    const sealed = await seal("Patrol van LA 123 XYZ", await importPublicKey(spki));
    expect(JSON.stringify(sealed)).not.toContain("LA 123");
    expect(await unseal(sealed, privateKey)).toBe("Patrol van LA 123 XYZ");
  });
});

describe("status codes", () => {
  it("generates six words from a 256-word list", () => {
    expect(generateStatusCode().split("-")).toHaveLength(6);
    expect(WORDS).toHaveLength(256);
    expect(new Set(WORDS).size).toBe(256);
    for (const w of WORDS) expect(w).toMatch(/^[a-z]{2,8}$/);
  });

  it("generated codes pass the shared StatusCode check", () => {
    const code = generateStatusCode();
    expect(StatusCode.parse(code)).toBe(code);
  });

  it("hashes deterministically for a given salt, case-insensitively", async () => {
    const a = await hashStatusCode("bird-coal-dawn-fish", "pepper");
    const b = await hashStatusCode("BIRD-coal-dawn-fish ", "pepper", unb64(a.salt));
    expect(b.hash).toBe(a.hash);
  });

  it("derives a stable lookup that depends on the secret key", async () => {
    const code = "bird-coal-dawn-fish-lamp-rope";
    expect(await statusLookup(code, "k1")).toBe(await statusLookup(code, "k1"));
    expect(await statusLookup(code, "k1")).not.toBe(await statusLookup(code, "k2"));
    expect(await statusLookup(code, "k1")).toMatch(/^[A-Za-z0-9+/=]{32,64}$/);
  });
});

async function env(overrides: Partial<Env> = {}): Promise<Env> {
  return {
    VAULT_SUPABASE_URL: "https://vault.example",
    VAULT_SUPABASE_ANON_KEY: "anon",
    OFFICER_DETAILS_PUBLIC_KEY: (await keyPair()).spki,
    STATUS_CODE_PEPPER: "pepper",
    STATUS_LOOKUP_KEY: "lookup-key",
    TURNSTILE_SITE_KEY: "site-key",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    PUBLIC_SITE_URL: "https://example.org",
    ...overrides,
  };
}

const post = (path: string, body: unknown) =>
  new Request(`https://safe.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9", "user-agent": "Phone" },
    body: JSON.stringify(body),
  });

/**
 * Fake upstreams: Turnstile siteverify and the vault's RPCs. `routes` maps an RPC
 * name to the response it gives; every call is recorded for inspection.
 */
function upstream(routes: Record<string, () => Response> = {}, turnstileOk = true) {
  const calls: { url: string; body: string }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? "");
    calls.push({ url, body });
    if (url.includes("challenges.cloudflare.com")) return Response.json({ success: turnstileOk });
    const name = url.split("/rpc/")[1]!;
    return routes[name]?.() ?? new Response(null, { status: 204 });
  });
  const rpcBody = (name: string) => JSON.parse(calls.find((c) => c.url.endsWith(`/rpc/${name}`))!.body);
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls, rpcBody };
}

describe("handleSubmit", () => {
  const valid = {
    city: "lagos",
    incidentType: "money_demanded",
    place: "Third Mainland Bridge",
    when: "today",
    consentToForward: true,
    lat: 6.5,
    lng: 3.4,
    officerDetails: "Van LA 123",
    turnstileToken: "token",
  };

  it("stores a grid cell, sealed officer details and the code's lookup, and never forwards identifying data", async () => {
    const up = upstream();
    const e = await env();
    const res = await handleSubmit(post("/api/submit", valid), e, up.fetchImpl);

    expect(res.status).toBe(201);
    const { statusCode } = (await res.json()) as { statusCode: string };
    expect(statusCode.split("-")).toHaveLength(6);

    const payload = up.rpcBody("submit_report");
    expect(payload.p_grid_cell).toBe(gridCell(6.5, 3.4));
    expect(payload.p_status_lookup).toBe(await statusLookup(statusCode, e.STATUS_LOOKUP_KEY));
    const everything = up.calls.map((c) => c.body).join("\n");
    for (const secret of ["203.0.113.9", "Phone", "Van LA 123", statusCode, '"6.5']) {
      expect(everything).not.toContain(secret);
    }
  });

  it("passes the report kind and time of day to the vault", async () => {
    const up = upstream();
    const commendation = { ...valid, kind: "commendation", incidentType: "helped_me", timeOfDay: "night" };
    const res = await handleSubmit(post("/api/submit", commendation), await env(), up.fetchImpl);

    expect(res.status).toBe(201);
    expect(up.rpcBody("submit_report")).toMatchObject({
      p_kind: "commendation",
      p_incident_type: "helped_me",
      p_time_of_day: "night",
    });
  });

  it("refuses when the Turnstile check fails, is missing, or isn't configured", async () => {
    const failing = upstream({}, false);
    expect((await handleSubmit(post("/api/submit", valid), await env(), failing.fetchImpl)).status).toBe(403);
    expect(failing.calls.some((c) => c.url.includes("/rpc/"))).toBe(false);

    const noToken: Partial<typeof valid> = { ...valid };
    delete noToken.turnstileToken;
    expect((await handleSubmit(post("/api/submit", noToken), await env(), upstream().fetchImpl)).status).toBe(403);

    const unconfigured = await env({ TURNSTILE_SECRET_KEY: "" });
    expect((await handleSubmit(post("/api/submit", valid), unconfigured, upstream().fetchImpl)).status).toBe(403);
  });

  it("never sends the visitor's IP to Turnstile", async () => {
    const up = upstream();
    await handleSubmit(post("/api/submit", valid), await env(), up.fetchImpl);
    const verify = up.calls.find((c) => c.url.includes("challenges.cloudflare.com"))!;
    expect(verify.body).not.toContain("remoteip");
    expect(verify.body).not.toContain("203.0.113.9");
  });

  it("rejects unexpected fields such as contact details", async () => {
    const res = await handleSubmit(post("/api/submit", { ...valid, phone: "+2348031234567" }), await env(), vi.fn());
    expect(res.status).toBe(422);
  });

  it("reports an upstream failure without details", async () => {
    const up = upstream({ submit_report: () => new Response("boom", { status: 500 }) });
    const res = await handleSubmit(post("/api/submit", valid), await env(), up.fetchImpl);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("boom");
  });
});

describe("status page", () => {
  const code = "bird-coal-dawn-fish-lamp-rope";
  const thread = { status: "forwarded", kind: "misconduct", forwards: [], messages: [] };

  async function vault(salt: string | null) {
    return upstream({
      code_salt: () => Response.json(salt),
      thread: () => Response.json(thread),
      post_message: () => new Response(null, { status: 204 }),
    });
  }

  it("finds the report by lookup, then proves the code with the report's salted hash", async () => {
    const e = await env();
    const { salt, hash } = await hashStatusCode(code, e.STATUS_CODE_PEPPER);
    const up = await vault(salt);
    const res = await handleStatus(post("/api/status", { code: " BIRD coal dawn-fish lamp ROPE " }), e, up.fetchImpl);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(thread);
    const lookup = await statusLookup(code, e.STATUS_LOOKUP_KEY);
    expect(up.rpcBody("code_salt")).toEqual({ p_lookup: lookup });
    expect(up.rpcBody("thread")).toEqual({ p_lookup: lookup, p_code_hash: hash });
    expect(up.calls.map((c) => c.body).join("\n")).not.toContain(code);
  });

  it("says not found for an unknown code, and checks the code's shape first", async () => {
    expect((await handleStatus(post("/api/status", { code }), await env(), (await vault(null)).fetchImpl)).status).toBe(404);
    const up = await vault(null);
    expect((await handleStatus(post("/api/status", { code: "bird-coal" }), await env(), up.fetchImpl)).status).toBe(422);
    expect(up.calls).toHaveLength(0);
  });

  it("posts a message after the Turnstile check", async () => {
    const e = await env();
    const { salt, hash } = await hashStatusCode(code, e.STATUS_CODE_PEPPER);
    const up = await vault(salt);
    const res = await handleMessage(post("/api/message", { code, body: " hello ", turnstileToken: "t" }), e, up.fetchImpl);

    expect(res.status).toBe(201);
    expect(up.rpcBody("post_message")).toMatchObject({ p_code_hash: hash, p_body: "hello" });

    const blocked = upstream({}, false);
    const refused = await handleMessage(post("/api/message", { code, body: "hi", turnstileToken: "t" }), e, blocked.fetchImpl);
    expect(refused.status).toBe(403);
  });

  it("explains the daily limit and closed reports", async () => {
    const e = await env();
    const { salt } = await hashStatusCode(code, e.STATUS_CODE_PEPPER);
    const failWith = (message: string) =>
      upstream({
        code_salt: () => Response.json(salt),
        post_message: () => Response.json({ code: "P0001", message }, { status: 400 }),
      }).fetchImpl;
    const send = (f: typeof fetch) => handleMessage(post("/api/message", { code, body: "hi", turnstileToken: "t" }), e, f);

    expect((await send(failWith("daily message limit reached"))).status).toBe(429);
    expect((await send(failWith("this report is closed"))).status).toBe(409);
    expect((await send(failWith("something else"))).status).toBe(502);
  });

  it("rejects messages with extra fields", async () => {
    const res = await handleMessage(
      post("/api/message", { code, body: "hi", phone: "+2348031234567", turnstileToken: "t" }),
      await env(),
      vi.fn(),
    );
    expect(res.status).toBe(422);
  });
});

describe("pages", () => {
  it("serves both pages with the site key, and a CSP that allows only Turnstile from outside", async () => {
    for (const path of ["/", "/status"]) {
      const res = await worker.fetch(new Request(`https://safe.example${path}`), await env());
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('data-sitekey="site-key"');
      const csp = res.headers.get("content-security-policy")!;
      expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com");
      expect(csp).not.toContain("unsafe-inline");
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("drops a site key that isn't a plain key", () => {
    expect(withSiteKey(STATUS_HTML, '"><script>')).toContain('data-sitekey=""');
  });

  it("renders messages as text, never as HTML", () => {
    expect(STATUS_JS).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
  });

  it("keeps the status code out of URLs and browser storage", () => {
    for (const js of [FORM_JS, STATUS_JS]) expect(js).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    expect(STATUS_JS).not.toMatch(/[?&]code=|location\.(search|hash)/);
  });
});

describe("privacy guardrails in source", () => {
  const src = join(import.meta.dirname, ".");
  const files = readdirSync(src).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  it("never logs", () => {
    for (const f of files) expect(readFileSync(join(src, f), "utf8"), f).not.toMatch(/console\./);
  });

  it("never reads identifying headers", () => {
    for (const f of files.filter((f) => f !== "privacy.ts")) {
      expect(readFileSync(join(src, f), "utf8"), f).not.toMatch(/cf-connecting-ip|x-forwarded-for|user-agent/i);
    }
  });

  it("keeps the pages small, with no outside assets in the HTML", () => {
    const total = [FORM_HTML, STATUS_HTML, SHARED_CSS, FORM_JS, STATUS_JS].reduce((n, s) => n + s.length, 0);
    expect(total).toBeLessThan(50_000);
    for (const html of [FORM_HTML, STATUS_HTML]) {
      expect(html).not.toMatch(/<script[^>]*src="https?:/);
      expect(html).not.toMatch(/<link[^>]*href="https?:/);
    }
  });
});
