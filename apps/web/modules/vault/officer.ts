import "server-only";

/**
 * Opens officer details sealed by the police intake Worker (apps/police-intake/src/crypto.ts):
 * an AES-256-GCM key wrapped with RSA-OAEP. Only this server holds the private key.
 */

export interface SealedText {
  v: 1;
  wrappedKey: string;
  iv: string;
  ciphertext: string;
}

const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let cachedKey: { source: string; key: Promise<CryptoKey> } | undefined;

/** Imports a base64 PKCS#8 RSA private key, cached per key value. */
export function importPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
  if (cachedKey?.source !== pkcs8Base64) {
    cachedKey = {
      source: pkcs8Base64,
      key: crypto.subtle.importKey("pkcs8", unb64(pkcs8Base64), { name: "RSA-OAEP", hash: "SHA-256" }, false, [
        "unwrapKey",
      ]),
    };
  }
  return cachedKey.key;
}

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
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) }, aesKey, unb64(sealed.ciphertext));
  return new TextDecoder().decode(plain);
}

/** Decrypts the stored column (JSON of SealedText). Returns null for none, and a marker if it can't be opened. */
export async function openOfficerDetails(stored: string | null, pkcs8Base64: string): Promise<string | null> {
  if (!stored) return null;
  let key: CryptoKey;
  try {
    key = await importPrivateKey(pkcs8Base64);
  } catch {
    cachedKey = undefined;
    return "[could not decrypt: OFFICER_DETAILS_PRIVATE_KEY isn't a base64 PKCS#8 RSA key (see apps/web/.env.example)]";
  }
  try {
    return await unseal(JSON.parse(stored) as SealedText, key);
  } catch {
    return "[could not decrypt: OFFICER_DETAILS_PRIVATE_KEY doesn't match the Worker's public key]";
  }
}
