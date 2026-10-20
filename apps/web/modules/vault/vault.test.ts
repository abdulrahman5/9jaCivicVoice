import { describe, expect, it } from "vitest";
import { openOfficerDetails } from "./officer";
import { buildForwardingPack, incidentDate, packReference, type PackInput } from "./pack";
import {
  ForwardOutcomeInput,
  ForwardTextInput,
  PoliceRejectInput,
  PoliceReplyInput,
  PoliceStatusInput,
  RecordForwardInput,
  identifyingHints,
} from "./schemas";

const reportId = "6f9c2a10-1b2c-4d5e-8f90-123456789abc";
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));

/** Seals text exactly as the police intake Worker does (apps/police-intake/src/crypto.ts). */
async function sealLikeWorker(text: string, publicKey: CryptoKey) {
  const aesKey = (await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"])) as CryptoKey;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(text));
  const wrappedKey = await crypto.subtle.wrapKey("raw", aesKey, publicKey, { name: "RSA-OAEP" });
  return JSON.stringify({ v: 1, wrappedKey: b64(wrappedKey), iv: b64(iv), ciphertext: b64(ciphertext) });
}

describe("openOfficerDetails", () => {
  it("opens what the Worker sealed, with the matching private key", async () => {
    const pair = (await crypto.subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["wrapKey", "unwrapKey"],
    )) as CryptoKeyPair;
    const pkcs8 = b64(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    const stored = await sealLikeWorker("Patrol van LA 123 XYZ", pair.publicKey);

    expect(await openOfficerDetails(stored, pkcs8)).toBe("Patrol van LA 123 XYZ");
    expect(await openOfficerDetails(null, pkcs8)).toBeNull();
    expect(await openOfficerDetails("not json", pkcs8)).toMatch(/doesn't match/);
    expect(await openOfficerDetails(stored, btoa("not a key"))).toMatch(/isn't a base64 PKCS#8/);
  });
});

describe("police moderation inputs", () => {
  it("only allows button statuses; forwarded comes from recording a forward", () => {
    expect(PoliceStatusInput.safeParse({ reportId, status: "consistent" }).success).toBe(true);
    expect(PoliceStatusInput.safeParse({ reportId, status: "forwarded" }).success).toBe(false);
  });

  it("builds the reporter-facing reason from the preset and the note", () => {
    const r = PoliceRejectInput.parse({ reportId, reason: "duplicate", note: "See your earlier report." });
    expect(r.publicReason).toBe("This repeats an earlier report, which we're already following up. See your earlier report.");
    expect(PoliceRejectInput.safeParse({ reportId, reason: "other", note: "" }).success).toBe(false);
    expect(PoliceRejectInput.safeParse({ reportId, reason: "not_enough_detail", note: "x".repeat(200) }).success).toBe(false);
  });

  it("requires real forwarding text and replies within the database limits", () => {
    expect(ForwardTextInput.safeParse({ reportId, text: "short" }).success).toBe(false);
    expect(ForwardTextInput.safeParse({ reportId, text: "x".repeat(3001) }).success).toBe(false);
    expect(PoliceReplyInput.parse({ reportId, body: "  Thanks  " }).body).toBe("Thanks");
    expect(PoliceReplyInput.safeParse({ reportId, body: " " }).success).toBe(false);
  });
});

describe("identifyingHints", () => {
  it("spots phone numbers, emails, ID numbers and handles", () => {
    expect(identifyingHints("Call me on 0803 123 4567")).toEqual(["a phone number"]);
    expect(identifyingHints("+2348031234567")).toContain("a phone number");
    expect(identifyingHints("write to ada@example.com")).toEqual(["an email address"]);
    expect(identifyingHints("my NIN is on file")).toEqual(["an ID number (NIN or BVN)"]);
    expect(identifyingHints("find me @ada_lagos")).toEqual(["a social media handle"]);
  });

  it("stays quiet on an ordinary redacted account", () => {
    expect(identifyingHints("Officers at a checkpoint on the expressway demanded N5,000 around 8pm.")).toEqual([]);
  });
});

describe("forwarding inputs", () => {
  it("records a configured channel, or the one described by hand", () => {
    expect(RecordForwardInput.parse({ reportId, recipient: "cru", channel: "CRU WhatsApp (0800 000 0000)" }).channel).toBe(
      "CRU WhatsApp (0800 000 0000)",
    );
    expect(RecordForwardInput.parse({ reportId, recipient: "psc", channel: "other", otherChannel: "Hand delivered" }).channel).toBe(
      "Hand delivered",
    );
    expect(RecordForwardInput.safeParse({ reportId, recipient: "psc", channel: "other", otherChannel: "" }).success).toBe(false);
    expect(RecordForwardInput.safeParse({ reportId, recipient: "ngo", channel: "x y" }).success).toBe(false);
  });

  it("treats an empty reference as none", () => {
    expect(RecordForwardInput.parse({ reportId, recipient: "cru", channel: "CRU email", reference: " " }).reference).toBeUndefined();
    expect(ForwardOutcomeInput.parse({ reportId, recipient: "cru", outcome: "acknowledged", reference: "CRU/123" }).reference).toBe(
      "CRU/123",
    );
  });

  it("doesn't let a moderator set an outcome back to awaiting", () => {
    expect(ForwardOutcomeInput.safeParse({ reportId, recipient: "cru", outcome: "awaiting" }).success).toBe(false);
  });
});

describe("forwarding pack", () => {
  const report: PackInput = {
    id: "16ee6a0c-4cb0-4844-a415-0e45c41fa3a3",
    kind: "misconduct",
    incident_type: "money_demanded",
    city: "fct",
    place: "Airport Road checkpoint",
    when_bucket: "earlier",
    occurred_on: null,
    created_at: "2026-10-20T07:27:41.123Z",
    forward_text: "Officers at a checkpoint demanded N5,000 before letting a bus pass.",
    officer_details: "Patrol van PL-TEST-01",
  };

  it("carries what the recipient needs: type, day, place, officer details, redacted text, our reference", () => {
    const pack = buildForwardingPack(report, "cru");
    expect(pack).toContain("To: Police Complaint Response Unit");
    expect(pack).toContain("Type: Money demanded at checkpoint");
    expect(pack).toContain("Date: before 2026-10-20");
    expect(pack).toContain("Location: Airport Road checkpoint, FCT Abuja");
    expect(pack).toContain("Patrol van PL-TEST-01");
    expect(pack).toContain(report.forward_text);
    expect(pack).toContain(packReference(report.id));
  });

  it("leaves out anything finer than the day, and the report's internal id", () => {
    const pack = buildForwardingPack(report, "psc");
    expect(pack).not.toMatch(/07:27|T07|\d{2}:\d{2}/);
    expect(pack).not.toContain(report.id);
  });

  it("words commendations as recognition", () => {
    const pack = buildForwardingPack({ ...report, kind: "commendation", incident_type: "refused_bribe" }, "psc");
    expect(pack).toContain("commendation of police conduct");
    expect(pack).toContain("What the officer did: Refused a bribe");
    expect(pack).toContain("pass this recognition to the officer");
  });

  it("dates 'just now' and 'today' to the filing day in Lagos time, and prefers an exact date", () => {
    expect(incidentDate({ when_bucket: "today", occurred_on: null, created_at: "2026-10-20T23:30:00Z" })).toBe("2026-10-21");
    expect(incidentDate({ when_bucket: "today", occurred_on: "2026-10-19", created_at: "2026-10-20T10:00:00Z" })).toBe("2026-10-19");
  });
});
