import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Server-only auth helpers: scrypt password hashing + HMAC session tokens.
 * Legacy plaintext passwords are transparently upgraded on next login.
 */

const SECRET =
  process.env.SESSION_SECRET ||
  process.env.GUEST_SECRET ||
  "cipher-clash-dev-secret-change-in-production";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(
  password: string,
  stored: string
): { ok: boolean; needsUpgrade: boolean } {
  if (!stored) return { ok: true, needsUpgrade: !!password }; // legacy no-password accounts
  if (stored.startsWith("scrypt$")) {
    const [, salt, hash] = stored.split("$");
    if (!salt || !hash) return { ok: false, needsUpgrade: false };
    const candidate = scryptSync(password || "", salt, 64);
    const expected = Buffer.from(hash, "hex");
    const ok = candidate.length === expected.length && timingSafeEqual(candidate, expected);
    return { ok, needsUpgrade: false };
  }
  // legacy plaintext
  const a = Buffer.from(password || "");
  const b = Buffer.from(stored);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return { ok, needsUpgrade: ok };
}

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function issueToken(playerId: number): string {
  const payload = `${playerId}.${Date.now()}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyToken(token: unknown): number | null {
  if (typeof token !== "string" || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [idStr, tsStr, sig] = parts;
  const payload = `${idStr}.${tsStr}`;
  const expected = createHmac("sha256", SECRET).update(payload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const issued = Number(tsStr);
  if (!issued || Date.now() - issued > TOKEN_TTL_MS) return null;
  const id = Number(idStr);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function randomToken(len = 24): string {
  return randomBytes(len).toString("hex").slice(0, len * 1.5);
}

export function adminUsernames(): string[] {
  return (process.env.ADMIN_USERNAMES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
