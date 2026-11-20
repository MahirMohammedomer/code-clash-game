"use client";

/**
 * Weekly Leagues — groups of 15 players from the global leaderboard,
 * computed deterministically client-side (no extra server tables needed):
 * your league is the chunk of the ranking you currently sit in. Top 3 get
 * "promoted" styling, bottom 3 "demotion" styling, allreset naturally as
 * trophies move during the week.
 */

export interface LeagueRow {
  id: number;
  username: string;
  trophies: number;
  isMe: boolean;
  avatarConfig: import("./avatar").AvatarConfig;
  frameId: string;
  division: string;
}

export interface WeeklyLeague {
  label: string;
  weekKey: string;
  rows: LeagueRow[];
  myIndex: number;
  promoteCount: number;
  demoteCount: number;
  leagueNumber: number;
}

export function currentWeekKey(d = new Date()): string {
  // ISO-8601 week number
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function computeWeeklyLeague(
  leaderboard: { id: number; username: string; trophies: number; avatarConfig: import("./avatar").AvatarConfig; frameId: string; division: string }[],
  meId: number | null,
): WeeklyLeague | null {
  if (!leaderboard.length) return null;
  const myIdx = meId != null ? leaderboard.findIndex((r) => r.id === meId) : -1;
  const anchor = myIdx >= 0 ? myIdx : 0;
  const start = Math.floor(anchor / 15) * 15;
  const chunk = leaderboard.slice(start, start + 15);
  if (!chunk.length) return null;
  return {
    label: `Week ${currentWeekKey().split("-W")[1]} · League ${Math.floor(start / 15) + 1}`,
    weekKey: currentWeekKey(),
    rows: chunk.map((r) => ({
      id: r.id,
      username: r.username,
      trophies: r.trophies,
      isMe: r.id === meId,
      avatarConfig: r.avatarConfig,
      frameId: r.frameId,
      division: r.division,
    })),
    myIndex: chunk.findIndex((r) => r.id === meId),
    promoteCount: 3,
    demoteCount: chunk.length >= 10 ? 3 : 0,
    leagueNumber: Math.floor(start / 15) + 1,
  };
}
