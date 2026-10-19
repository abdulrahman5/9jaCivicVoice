import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WebhookPayload, extractMessages, toBotInput } from "./payload";
import { verifyMetaSignature } from "./signature";

const secret = "test-app-secret";
const sign = (body: string) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

describe("verifyMetaSignature", () => {
  const body = JSON.stringify({ hello: "world" });

  it("accepts a correct signature", () => {
    expect(verifyMetaSignature(body, sign(body), secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyMetaSignature(body + " ", sign(body), secret)).toBe(false);
  });

  it("rejects missing or malformed headers", () => {
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, "md5=abc", secret)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=abc", secret)).toBe(false);
  });
});

describe("payload parsing", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "123",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              messages: [
                { id: "wamid.1", from: "2348031234567", timestamp: "1", type: "text", text: { body: "Hi" } },
                {
                  id: "wamid.2",
                  from: "2348031234567",
                  timestamp: "2",
                  type: "location",
                  location: { latitude: 6.6, longitude: 3.35 },
                },
                { id: "wamid.3", from: "2348031234567", timestamp: "3", type: "sticker" },
              ],
            },
          },
        ],
      },
    ],
  };

  it("extracts and normalises messages", () => {
    const messages = extractMessages(WebhookPayload.parse(payload));
    expect(messages.map(toBotInput)).toEqual([
      { kind: "text", text: "Hi" },
      { kind: "location", lat: 6.6, lng: 3.35 },
      { kind: "unsupported" },
    ]);
  });
});
