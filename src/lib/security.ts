/**
 * Lightweight security helpers for Code Clash
 */

const RATE_BUCKETS = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { ok: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = RATE_BUCKETS.get(key);

  if (!entry || now >= entry.resetAt) {
    RATE_BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (entry.count >= maxRequests) {
    return { ok: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { ok: true };
}

export function sanitizeUsername(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[<>'"\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}

export function sanitizeText(raw: unknown, maxLen = 300): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export function isValidCodeFormat(code: unknown): code is string {
  if (typeof code !== "string") return false;
  if (!/^[1-9]{4}$/.test(code)) return false;
  const set = new Set(code.split(""));
  return set.size === 4;
}

/** Simple hash for local tokens (not crypto-grade, just obfuscation) */
export function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return `cc_${Math.abs(h).toString(36)}_${input.length}`;
}

/** Strip secrets from match objects before sending to clients */
export function stripMatchSecrets<T extends Record<string, unknown>>(match: T, viewerId?: number | null): T {
  const copy = { ...match };
  const p1Id = copy.player1Id as number | undefined;
  const p2Id = copy.player2Id as number | undefined;

  // Only the owner of a secret may see it
  if (viewerId == null || viewerId !== p1Id) {
    (copy as any).player1Secret = "";
  }
  if (viewerId == null || viewerId !== p2Id) {
    (copy as any).player2Secret = "";
  }
  return copy;
}

export function assertPlayerId(id: unknown): number | null {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0 || n > 2_000_000_000) return null;
  return n;
}
