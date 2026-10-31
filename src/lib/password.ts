import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!password || !stored) return false;
  if (!stored.startsWith("scrypt:")) return stored === password; // Legacy accounts migrate on successful login.
  const [, salt, hex] = stored.split(":");
  if (!salt || !hex || !/^[0-9a-f]{128}$/i.test(hex)) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}
