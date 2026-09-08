import { randomBytes, createHash } from "node:crypto";
import { customAlphabet } from "nanoid";

/** Public request reference — matches the legacy AKR-###### shape so old
    emails and WhatsApp threads still read the same. */
export function makeReference(): string {
  const n = 100000 + Math.floor(randomBytes(4).readUInt32BE(0) / 0xffffffff * 900000);
  return `AKR-${Math.min(n, 999999)}`;
}

export function isReference(s: string): boolean {
  return /^AKR-\d{6}$/.test(s.trim().toUpperCase());
}

/** Opaque token that lets a guest track a request without an account. */
export function makeTrackingToken(): string {
  return randomBytes(16).toString("base64url");
}

const refAlphabet = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 7);
export function makeReferralCode(): string {
  return refAlphabet();
}

/** Reset / verify tokens: the plaintext goes in the email, the hash in the DB. */
export function makeAuthToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}
