"use client";

/**
 * Client session storage (v3).
 * - Registered users: { playerId, username, token } (token verified server-side)
 * - Guests: full local profile so their progress persists on-device.
 */

import type { Player, RoomSession } from "./types";

const SESSION_KEY = "cipherclash_session_v3";
const GUEST_KEY = "cipherclash_guest_profile_v3";
const ROOM_KEY = "cipherclash_room_v3";
const PENDING_RESULTS_KEY = "cipherclash_pending_results_v3";

export interface SessionData {
  playerId: number | null;
  username: string;
  token: string | null;
  isGuest: boolean;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function loadSession(): SessionData | null {
  if (typeof window === "undefined") return null;
  const s = safeParse<SessionData | null>(localStorage.getItem(SESSION_KEY), null);
  if (s && (s.isGuest || (s.playerId && s.token))) return s;
  // migrate pre-v3 guest sessions so returning guests keep their name
  try {
    const legacy = safeParse<{ username?: string; isGuest?: boolean } | null>(
      localStorage.getItem("codeclash_session_v2"), null
    );
    if (legacy?.isGuest && legacy.username) {
      const migrated: SessionData = { playerId: null, username: legacy.username, token: null, isGuest: true };
      saveSession(migrated);
      return migrated;
    }
    if (legacy?.username) {
      // registered user from old version: remember the name for the login form
      localStorage.setItem("cipherclash_last_username", legacy.username);
    }
  } catch {}
  return null;
}

export function saveSession(s: SessionData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  if (s.username) localStorage.setItem("cipherclash_last_username", s.username);
}

export function lastUsername(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("cipherclash_last_username") || "";
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(ROOM_KEY);
}

export function loadGuestProfile(): Player | null {
  if (typeof window === "undefined") return null;
  return safeParse<Player | null>(localStorage.getItem(GUEST_KEY), null);
}

export function saveGuestProfile(p: Player): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GUEST_KEY, JSON.stringify(p));
}

/** Active online room (for reconnect after refresh / app close). */
export function loadRoomSession(): RoomSession | null {
  if (typeof window === "undefined") return null;
  const r = safeParse<RoomSession | null>(localStorage.getItem(ROOM_KEY), null);
  if (!r) return null;
  if (Date.now() - r.savedAt > 2 * 60 * 60 * 1000) {
    localStorage.removeItem(ROOM_KEY);
    return null;
  }
  return r;
}

export function saveRoomSession(r: RoomSession | null): void {
  if (typeof window === "undefined") return;
  if (r) localStorage.setItem(ROOM_KEY, JSON.stringify(r));
  else localStorage.removeItem(ROOM_KEY);
}

/** Match results that failed to reach the server (retried on next launch). */
export interface PendingResult {
  payload: Record<string, unknown>;
  savedAt: number;
}

export function queuePendingResult(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const q = safeParse<PendingResult[]>(localStorage.getItem(PENDING_RESULTS_KEY), []);
  q.push({ payload, savedAt: Date.now() });
  localStorage.setItem(PENDING_RESULTS_KEY, JSON.stringify(q.slice(-20)));
}

export function loadPendingResults(): PendingResult[] {
  if (typeof window === "undefined") return [];
  return safeParse<PendingResult[]>(localStorage.getItem(PENDING_RESULTS_KEY), []);
}

export function clearPendingResults(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PENDING_RESULTS_KEY);
}

export function makeId(prefix = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Minutes EAST of UTC (for server-side streak / daily calculations). */
export function tzEastMinutes(): number {
  return -new Date().getTimezoneOffset();
}
