/**
 * Match history helpers (client). Every finished match is stored locally
 * (last 20) for replays — guests included. Registered players also sync to
 * the server via record_match_result's `history` payload.
 */
import type { HistoryEntry } from "./types";
import { makeId } from "./session";

const KEY = "cipherclash_history_v1";
const MAX_LOCAL = 20;

export function loadLocalHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveLocalHistoryEntry(entry: HistoryEntry): HistoryEntry[] {
  try {
    const list = loadLocalHistory().filter((e) => e.historyId !== entry.historyId);
    list.unshift(entry);
    const trimmed = list.slice(0, MAX_LOCAL);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch {
    return [entry];
  }
}

export function newHistoryId(): string {
  return makeId("hist");
}

/** Shape sent to the server inside record_match_result / record_daily_code. */
export function historyPayload(entry: HistoryEntry) {
  return {
    historyId: entry.historyId,
    mode: entry.mode,
    oppName: entry.oppName,
    oppAvatar: entry.oppAvatar,
    myAvatar: entry.myAvatar,
    oppPlayerId: entry.oppPlayerId ?? null,
    mySecret: entry.mySecret,
    oppSecret: entry.oppSecret,
    guesses: entry.guesses,
    endReason: entry.endReason ?? null,
  };
}
