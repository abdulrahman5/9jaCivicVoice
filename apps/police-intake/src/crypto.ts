/**
 * Cryptography for the police intake, using only WebCrypto (available in
 * Workers and Node 22).
 *
 * Officer details: hybrid encryption. A random AES-256-GCM key encrypts the
 * text, and the key is wrapped with an RSA-OAEP public key. Only the admin
 * server holds the private key, so the Worker can encrypt but never decrypt.
 *
 * Status codes: six words (48 bits) shown once to the reporter. Two values are
 * stored: a lookup (HMAC with a Worker secret) that finds the report, and a
 * salted PBKDF2 hash that must match before anything is returned. Lookups are
 * rate-limited at the edge. TODO: move the hash to Argon2id (WASM) before launch.
 */

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", unb64(spkiBase64), { name: "RSA-OAEP", hash: "SHA-256" }, false, [
    "wrapKey",
  ]);
}

export interface SealedText {
  v: 1;
  wrappedKey: string;
  iv: string;
  ciphertext: string;
}

export async function seal(plaintext: string, publicKey: CryptoKey): Promise<SealedText> {
  const aesKey = (await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"])) as CryptoKey;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, enc.encode(plaintext));
  const wrappedKey = await crypto.subtle.wrapKey("raw", aesKey, publicKey, { name: "RSA-OAEP" });
  return { v: 1, wrappedKey: b64(wrappedKey), iv: b64(iv), ciphertext: b64(ciphertext) };
}

/** Used by the admin server (and tests). Never deployed in the Worker. */
export async function unseal(sealed: SealedText, privateKey: CryptoKey): Promise<string> {
  const aesKey = await crypto.subtle.unwrapKey(
    "raw",
    unb64(sealed.wrappedKey),
    privateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) }, aesKey, unb64(sealed.ciphertext));
  return new TextDecoder().decode(plaintext);
}

// Exactly 256 short, distinct, easy-to-type English words → 8 bits each, 48 bits for six.
export const WORDS = (
  "able acid aged also area army away baby back ball band bank base bath bear beat bell belt best bird blow blue boat body " +
  "bone book boot born boss both bowl bulk burn bush busy cake call calm came camp card care cart case cash cast cell chat " +
  "chip city clay club coal coat code cold cook cool cope copy core cost crew crop dark data date dawn days deal dear debt " +
  "deep deer desk dial diet dirt dish disk dock does done door dose down draw drop drum dual duke dust duty each earn ease " +
  "east easy edge else even ever evil exit face fact fair fall farm fast fate fear feed feel feet fell felt file fill film " +
  "find fine fire firm fish five flag flat flow folk food foot form fort four free from fuel full fund gain game gate gave " +
  "gear gift girl give glad goal goes gold golf gone good gray grew grow gulf hair half hall hand hang hard harm hate have " +
  "head hear heat held hell help here hero high hill hint hire hold hole holy home hope horn host hour huge hung hunt hurt " +
  "idea inch into iron item jack jazz join jump jury just keen keep kept kick kind king knee knew know lack lady laid lake " +
  "land lane last late lead left lend less life lift like line link list live load loan lock long look lord lose loss lost " +
  "loud love luck made mail main make male many mark mass meal mean meat meet menu"
).split(" ");

export const STATUS_CODE_WORDS = 6;

export function generateStatusCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(STATUS_CODE_WORDS));
  return Array.from(bytes, (b) => WORDS[b % WORDS.length]).join("-");
}

export async function hashStatusCode(code: string, pepper: string, salt?: Uint8Array) {
  const s = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(code.toLowerCase().trim() + pepper), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: s, iterations: 100_000 }, key, 256);
  return { salt: b64(s), hash: b64(bits) };
}

/** Deterministic lookup for a (normalised) status code: HMAC-SHA256 with a Worker secret. */
export async function statusLookup(code: string, key: string): Promise<string> {
  const hmacKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return b64(await crypto.subtle.sign("HMAC", hmacKey, enc.encode(code)));
}

export { b64, unb64 };
