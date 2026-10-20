import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { b64, generateStatusCode, hashStatusCode, seal, unseal, importPublicKey, unb64 } from "./crypto";
import { handleSubmit, type Env } from "./index";
import { cellCentre, gridCell } from "./privacy";
import { FORM_CSS, FORM_HTML, FORM_JS } from "./form";

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
  it("generates four words", () => {
    expect(generateStatusCode().split("-")).toHaveLength(4);
  });

  it("hashes deterministically for a given salt, case-insensitively", async () => {
    const a = await hashStatusCode("bird-coal-dawn-fish", "pepper");
    const b = await hashStatusCode("BIRD-coal-dawn-fish ", "pepper", unb64(a.salt));
    expect(b.hash).toBe(a.hash);
  });
});

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
  };

  async function env(): Promise<Env> {
    return {
      VAULT_SUPABASE_URL: "https://vault.example",
      VAULT_SUPABASE_ANON_KEY: "anon",
      OFFICER_DETAILS_PUBLIC_KEY: (await keyPair()).spki,
      STATUS_CODE_PEPPER: "pepper",
      PUBLIC_SITE_URL: "https://example.org",
    };
  }

  const request = (body: unknown) =>
    new Request("https://safe.example/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9", "user-agent": "Phone" },
      body: JSON.stringify(body),
    });

  it("stores a grid cell and sealed officer details, and never forwards identifying data", async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response("{}", { status: 200 }));
    const res = await handleSubmit(request(valid), await env(), fetchMock as unknown as typeof fetch);

    expect(res.status).toBe(201);
    const { statusCode } = (await res.json()) as { statusCode: string };
    expect(statusCode.split("-")).toHaveLength(4);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const sent = init.body as string;
    const payload = JSON.parse(sent);
    expect(payload.p_grid_cell).toBe(gridCell(6.5, 3.4));
    expect(sent).not.toContain("203.0.113.9");
    expect(sent).not.toContain("Phone");
    expect(sent).not.toContain("Van LA 123");
    expect(sent).not.toContain(statusCode);
    expect(sent).not.toContain('"6.5');
  });

  it("passes the report kind and time of day to the vault", async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response("{}", { status: 200 }));
    const commendation = { ...valid, kind: "commendation", incidentType: "helped_me", timeOfDay: "night" };
    const res = await handleSubmit(request(commendation), await env(), fetchMock as unknown as typeof fetch);

    expect(res.status).toBe(201);
    const payload = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(payload).toMatchObject({ p_kind: "commendation", p_incident_type: "helped_me", p_time_of_day: "night" });
  });

  it("rejects unexpected fields such as contact details", async () => {
    const res = await handleSubmit(request({ ...valid, phone: "+2348031234567" }), await env(), vi.fn());
    expect(res.status).toBe(422);
  });

  it("reports an upstream failure without details", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    const res = await handleSubmit(request(valid), await env(), fetchMock as unknown as typeof fetch);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("boom");
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

  it("keeps the form small and free of third-party assets", () => {
    const total = FORM_HTML.length + FORM_CSS.length + FORM_JS.length;
    expect(total).toBeLessThan(50_000);
    expect(FORM_HTML).not.toMatch(/<script[^>]*src="https?:/);
    expect(FORM_HTML).not.toMatch(/<link[^>]*href="https?:/);
  });
});
