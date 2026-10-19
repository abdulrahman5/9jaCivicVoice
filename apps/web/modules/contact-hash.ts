import { createHmac } from "node:crypto";

/**
 * Contact details are stored only as HMAC-SHA256(normalised phone, pepper)
 * (architecture doc, "Data architecture"). The pepper is held outside the
 * database, so a database dump alone can't be brute-forced back to numbers.
 */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+234${digits.slice(1)}`;
  return `+${digits}`;
}

export function hashContact(rawPhone: string, pepper: string): string {
  if (pepper.length < 32) throw new Error("CONTACT_HASH_PEPPER must be at least 32 characters");
  return createHmac("sha256", pepper).update(normalisePhone(rawPhone)).digest("hex");
}
