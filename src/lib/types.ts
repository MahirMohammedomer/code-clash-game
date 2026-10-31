import type { AvatarConfig } from "./avatar";
import type { DailyStats } from "./game-engine";

/** Player shape as returned by the API (never includes passwordHash). */
export interface Player {
  id: number | null;
  username: string;
  authProvider: string;
  avatarConfig: AvatarConfig;
  avatarEmoji?: string; // legacy, unused in new UI
  title: string;
  frameId: string;
  themeId: string;
  effectId: string;
  division: string;
  trophies: number;
  level: number;
  xp: number;
  ownedCosmetics: string[];
  completedAchievements: string[];
  coins: number;
  gems: number;
  streakDays: number;
  lastPlayDate?: string | null;
  wins: number;
  losses: number;
  totalGames: number;
  fastestWinTurns: number | null;
  dailyStats?: DailyStats;
  claimedDailyQuests?: string[]; // entries like "quest_play_2:2026-10-31"
  dailyChallengeDone?: string | null; // dateKey
  tutorialSeen?: boolean;
  isAdmin?: boolean;
  isGuest?: boolean;
  isOnline?: boolean;
  lastSeenAt?: string;
  createdAt?: string;
}

export interface GuessEntry {
  id: string;
  playerSlot: 1 | 2;
  playerName: string;
  guess: string; // "4829" | "TIMEOUT"
  points: number;
  orders: number;
  isTimeout: boolean;
  turnNumber: number;
  timestamp: string;
}

/** Safe match view coming from the server (secrets never included). */
export interface MatchView {
  id: number;
  roomCode: string;
  mode: string;
  status: "waiting" | "setup" | "playing" | "finished" | "abandoned";
  timerSeconds: number;
  version: number;
  player1Id: number | null;
  player1Name: string;
  player1Avatar: AvatarConfig;
  player1Frame?: string;
  player1Division: string;
  player2Id: number | null;
  player2Name: string;
  player2Avatar: AvatarConfig;
  player2Frame?: string;
  player2Division: string;
  hasSecret1: boolean;
  hasSecret2: boolean;
  hasPlayer2?: boolean;
  currentTurn: 1 | 2;
  turnStartedAt: string;
  guesses: GuessEntry[];
  winnerSlot: number | null;
  winnerName: string | null;
  endReason?: string | null;
  p1SeenAt?: string | null;
  p2SeenAt?: string | null;
  serverNow: string;
  createdAt: string;
  unchanged?: boolean;
}

export interface RoomSession {
  roomCode: string;
  slot: 1 | 2;
  token: string;
  secret?: string;
  savedAt: number;
}

export interface MatchChatMessage {
  id: number;
  senderSlot: 1 | 2;
  senderName: string;
  content: string;
  createdAt: string;
}

export interface MatchReaction {
  id: number;
  senderSlot: 1 | 2;
  senderName: string;
  reaction: string;
  createdAt: string;
}

export interface LeaderboardRow {
  id: number;
  username: string;
  avatarConfig: AvatarConfig;
  frameId: string;
  title: string;
  division: string;
  trophies: number;
  level: number;
  wins: number;
  totalGames: number;
  streakDays: number;
  isOnline: boolean;
}

export interface Review {
  id: number;
  username: string;
  rating: number;
  comment: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface FeedbackRow {
  id: number;
  username: string;
  kind: string;
  message: string;
  createdAt: string;
}

export interface MatchResultPayload {
  won: boolean;
  mode: string;
  turnsTaken: number;
  ordersTotal: number;
  aiDifficulty?: string;
  trophyDelta: number;
  coinsEarned: number;
  xpEarned: number;
  dailyChallengeId?: string;
  resultId: string; // idempotency key
}
