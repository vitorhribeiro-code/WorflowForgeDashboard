import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Formato armazenado: scrypt$<salt_hex>$<hash_hex>. Determinístico dado o salt.
const SCHEME = "scrypt";
const KEYLEN = 64;

export function hashPassword(password: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, s, KEYLEN).toString("hex");
  return `${SCHEME}$${s}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== SCHEME || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, KEYLEN);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
