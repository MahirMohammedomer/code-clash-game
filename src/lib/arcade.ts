/**
 * Local persistence for the premium arcade remakes:
 * best scores + play counts, stored per game on the device.
 */

export type ArcadeGameId =
  | "g2048" | "snake" | "flappy" | "gems" | "breakout" | "hopper"
  | "dino" | "defender" | "mole" | "mines" | "connect4" | "blackjack";

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
