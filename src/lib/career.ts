"use client";

/**
 * Career Mode — an offline ladder of 20 bot challenges with one-time rewards.
 * Progress is stored per-username on-device (works fully offline); claims are
 * synced to the server for accounts via the pending-results queue.
 */

import { CAREER_STAGES, type AIDifficulty, type CareerStage } from "./game-engine";

export { CAREER_STAGES };
export type { CareerStage };

export interface CareerProgress {
  claimed: string[]; // stages beaten
  rewarded: string[]; // stages whose reward was granted locally (guests)
  stars: Record<string, number>;
}

const key = (username: string) => `cipherclash_career_${username.replace(/[^a-zA-Z0-9_-]/g, "")}`;

export function loadCareerProgress(username: string): CareerProgress {
  try {
    const raw = localStorage.getItem(key(username));
    if (raw) {
      const o = JSON.parse(raw) as CareerProgress;
      return {
        claimed: Array.isArray(o.claimed) ? o.claimed : [],
        rewarded: Array.isArray(o.rewarded) ? o.rewarded : [],
        stars: o.stars && typeof o.stars === "object" ? o.stars : {},
      };
    }
  } catch {}
  return { claimed: [], rewarded: [], stars: {} };
}

/** Mark a stage's reward as paid locally (guests). */
export function markStageRewarded(username: string, stageId: string): void {
  const p = loadCareerProgress(username);
  if (!p.rewarded.includes(stageId)) {
    p.rewarded.push(stageId);
    saveCareerProgress(username, p);
  }
}

export function isStageRewarded(username: string, stageId: string): boolean {
  return loadCareerProgress(username).rewarded.includes(stageId);
}

export function saveCareerProgress(username: string, p: CareerProgress): void {
  try { localStorage.setItem(key(username), JSON.stringify(p)); } catch {}
}

/** Mark a stage as beaten (stars based on margin vs the par turns). */
export function recordStageWin(username: string, stage: CareerStage, turnsTaken: number): number {
  const p = loadCareerProgress(username);
  const par = stage.maxTurns ?? 7;
  const stars = turnsTaken <= Math.max(1, par - 2) ? 3 : turnsTaken <= par ? 2 : 1;
  p.stars[stage.id] = Math.max(p.stars[stage.id] || 0, stars);
  if (!p.claimed.includes(stage.id)) p.claimed.push(stage.id);
  saveCareerProgress(username, p);
  return stars;
}

export function careerStageUnlocked(idx: number, claimed: string[]): boolean {
  return idx === 0 || claimed.includes(CAREER_STAGES[idx - 1].id);
}

export function careerStageMet(stage: CareerStage, won: boolean, turnsTaken: number): boolean {
  return won && (stage.maxTurns === undefined || turnsTaken <= stage.maxTurns);
}
