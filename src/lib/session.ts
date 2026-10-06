/**
 * Client-side session & offline support for Code Clash
 * - Persists login across app closes
 * - Stores offline match results until sync
 * - Guests stay local only (never hit the database)
 */

const SESSION_KEY = "codeclash_session_v2";
const OFFLINE_QUEUE_KEY = "codeclash_offline_queue_v1";
const GUEST_PREFIX = "guest_";

export interface SessionPlayer {
  id: number | null; // null for pure guests
  username: string;
  avatarEmoji: string;
  isGuest: boolean;
  token?: string; // simple local token for registered users
  lastSyncedAt?: string;
}

export interface OfflineMatchResult {
  id: string;
  mode: string;
  won: boolean;
  turns: number;
  opponentName: string;
  timestamp: string;
  coinsEarned: number;
  trophiesDelta: number;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadSession(): SessionPlayer | null {
  if (typeof window === "undefined") return null;
  return safeParse<SessionPlayer | null>(localStorage.getItem(SESSION_KEY), null);
}

export function saveSession(player: SessionPlayer): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(player));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

export function createGuestSession(username?: string): SessionPlayer {
  const name =
    username?.trim() ||
    `Guest${Math.floor(1000 + Math.random() * 9000)}`;
  const guest: SessionPlayer = {
    id: null,
    username: name.slice(0, 16),
    avatarEmoji: "🦉",
    isGuest: true,
  };
  saveSession(guest);
  return guest;
}

export function isGuestUsername(name: string): boolean {
  return name.toLowerCase().startsWith("guest") || name.startsWith(GUEST_PREFIX);
}

/** Offline match queue */
export function getOfflineQueue(): OfflineMatchResult[] {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(OFFLINE_QUEUE_KEY), []);
}

export function pushOfflineResult(result: OfflineMatchResult): void {
  if (typeof window === "undefined") return;
  const q = getOfflineQueue();
  q.push(result);
  // keep last 30
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q.slice(-30)));
}

export function clearOfflineQueue(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}

export function generateLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
