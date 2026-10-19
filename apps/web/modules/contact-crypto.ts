import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Reversible encryption for phone numbers we must message later (status
 * updates). AES-256-GCM with a key held outside the database (CONTACT_ENC_KEY),
 * so a database dump alone reveals no numbers. Format: base64(iv | tag | ciphertext).
 */
function key(base64Key: string): Buffer {
  const k = Buffer.from(base64Key, "base64");
  if (k.length !== 32) throw new Error("CONTACT_ENC_KEY must be 32 bytes, base64-encoded");
  return k;
}

export function encryptContact(phone: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(phone, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptContact(envelope: string, base64Key: string): string {
  const raw = Buffer.from(envelope, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(base64Key), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
