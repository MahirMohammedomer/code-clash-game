/**
 * Local persistence for the premium arcade remakes:
 * best scores + play counts, stored per game on the device.
 */

export type ArcadeGameId =
  | "g2048" | "snake" | "flappy" | "gems" | "breakout" | "hopper"
  | "dino" | "defender" | "mole" | "mines" | "connect4" | "blackjack"
  | "pong" | "dash" | "wordle" | "sudoku" | "slide" | "rps"
  | "duel" | "defense" | "jigsaw" | "cards" | "keys";

/**
 * Canvas pixel ratio tuned for weak phones: full sharpness on desktop,
 * gentler on touch devices (far fewer pixels to fill = much smoother on
 * phones without a real GPU), gentlest when Data Saver / 2G is detected.
 */
export function arcadeDpr(): number {
  if (typeof window === "undefined") return 1;
  const dpr = window.devicePixelRatio || 1;
  try {
    const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || conn?.effectiveType === "2g" || conn?.effectiveType === "slow-2g") return 1;
    const cores = navigator.hardwareConcurrency ?? 4;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    if (cores <= 2) return Math.min(1.25, dpr);
    if (coarse) return Math.min(1.5, dpr);
  } catch {}
  return Math.min(2, dpr);
}

const bestKey = (id: ArcadeGameId) => `arcade_best_${id}`;
const playsKey = (id: ArcadeGameId) => `arcade_plays_${id}`;

export function getBest(id: ArcadeGameId): number {
  try {
    return Number(localStorage.getItem(bestKey(id)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function getPlays(id: ArcadeGameId): number {
  try {
    return Number(localStorage.getItem(playsKey(id)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function bumpPlays(id: ArcadeGameId): void {
  try {
    localStorage.setItem(playsKey(id), String(getPlays(id) + 1));
  } catch {}
}

/** Save a finished score. Returns the (possibly new) best and whether it is a record. */
export function submitScore(id: ArcadeGameId, score: number): { best: number; isNewBest: boolean } {
  const prev = getBest(id);
  if (score > prev) {
    try {
      localStorage.setItem(bestKey(id), String(score));
    } catch {}
    return { best: score, isNewBest: true };
  }
  return { best: prev, isNewBest: false };
}
