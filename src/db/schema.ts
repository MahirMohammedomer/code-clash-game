import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import type { AvatarConfig } from "@/lib/avatar";
import type { DailyStats } from "@/lib/game-engine";

export interface MatchGuessEntry {
  id: string;
  playerSlot: 1 | 2;
  playerName: string;
  guess: string; // "4829" or "TIMEOUT"
  points: number;
  orders: number;
  isTimeout: boolean;
  turnNumber: number;
  timestamp: string;
}

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull().default(""),
  authProvider: text("auth_provider").notNull().default("local"),
  avatarEmoji: text("avatar_emoji").notNull().default(""), // legacy (unused in v3 UI)
  avatarConfig: jsonb("avatar_config")
    .$type<AvatarConfig>()
    .notNull()
    .default({ base: "owl", color: "classic", accessory: "none" }),
  title: text("title").notNull().default("Code Breaker"),
  frameId: text("frame_id").notNull().default("frame_emerald"),
  themeId: text("theme_id").notNull().default("theme_classic"),
  effectId: text("effect_id").notNull().default("effect_confetti"),
  division: text("division").notNull().default("Bronze"),
  trophies: integer("trophies").notNull().default(0),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  seasonXp: integer("season_xp").notNull().default(0),
  hasPremiumPass: boolean("has_premium_pass").notNull().default(false),
  claimedFreeTiers: jsonb("claimed_free_tiers").$type<number[]>().notNull().default([]),
  claimedPremiumTiers: jsonb("claimed_premium_tiers").$type<number[]>().notNull().default([]),
  ownedCosmetics: jsonb("owned_cosmetics")
    .$type<string[]>()
    .notNull()
    .default(["base_owl", "color_classic", "acc_none", "frame_emerald", "theme_classic", "effect_confetti", "title_breaker"]),
  completedAchievements: jsonb("completed_achievements").$type<string[]>().notNull().default([]),
  claimedQuests: jsonb("claimed_quests").$type<string[]>().notNull().default([]),
  claimedDailyQuests: jsonb("claimed_daily_quests").$type<string[]>().notNull().default([]),
  dailyStats: jsonb("daily_stats").$type<DailyStats>(),
  dailyChallengeDone: text("daily_challenge_done"),
  dailyCodeDone: text("daily_code_done"), // 'YYYY-MM-DD' of last solved Daily Code
  seasonId: text("season_id").notNull().default(""), // '' = pre-seasons (no reset on first sight)
  seasonPeakTrophies: integer("season_peak_trophies").notNull().default(0),
  coins: integer("coins").notNull().default(0),
  gems: integer("gems").notNull().default(0),
  streakDays: integer("streak_days").notNull().default(1),
  lastPlayDate: text("last_play_date"), // 'YYYY-MM-DD' in player's timezone
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  totalGames: integer("total_games").notNull().default(0),
  fastestWinTurns: integer("fastest_win_turns"),
  tutorialSeen: boolean("tutorial_seen").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  clubId: integer("club_id"),
  isOnline: boolean("is_online").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const clubs = pgTable("clubs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tag: text("tag").notNull(),
  badgeEmoji: text("badge_emoji").notNull().default("shield"),
  description: text("description").notNull(),
  totalTrophies: integer("total_trophies").notNull().default(0),
  memberCount: integer("member_count").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const follows = pgTable("follows", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").notNull(),
  followingId: integer("following_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  roomCode: text("room_code").notNull().unique(),
  mode: text("mode").notNull().default("online_1v1"),
  status: text("status").notNull().default("waiting"),
  timerSeconds: integer("timer_seconds").notNull().default(45),
  version: integer("version").notNull().default(1),
  isPrivate: boolean("is_private").notNull().default(false),
  player1Id: integer("player1_id"),
  player1Name: text("player1_name").notNull(),
  player1Avatar: text("player1_avatar").notNull().default(""), // legacy
  player1AvatarConfig: jsonb("player1_avatar_config").$type<AvatarConfig>(),
  player1Frame: text("player1_frame").notNull().default("frame_emerald"),
  player1Division: text("player1_division").notNull().default("Bronze"),
  player1Secret: text("player1_secret").notNull().default(""),
  p1Token: text("p1_token"),
  p1SeenAt: timestamp("p1_seen_at"),
  player2Id: integer("player2_id"),
  player2Name: text("player2_name").notNull().default("Waiting..."),
  player2Avatar: text("player2_avatar").notNull().default(""), // legacy
  player2AvatarConfig: jsonb("player2_avatar_config").$type<AvatarConfig>(),
  player2Frame: text("player2_frame").notNull().default("frame_emerald"),
  player2Division: text("player2_division").notNull().default("Bronze"),
  player2Secret: text("player2_secret").notNull().default(""),
  p2Token: text("p2_token"),
  p2SeenAt: timestamp("p2_seen_at"),
  aiDifficulty: text("ai_difficulty"),
  currentTurn: integer("current_turn").notNull().default(1),
  turnStartedAt: timestamp("turn_started_at").defaultNow().notNull(),
  guesses: jsonb("guesses").$type<MatchGuessEntry[]>().notNull().default([]),
  winnerSlot: integer("winner_slot"),
  winnerName: text("winner_name"),
  endReason: text("end_reason"),
  tournamentId: integer("tournament_id"),
  raceCode: text("race_code"), // shared secret for online_race mode (never exposed until finished)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Legacy table kept so old code/data still resolves; UI v3 doesn't use it.
export const tournaments = pgTable("tournaments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("mass_hunt"),
  status: text("status").notNull().default("live"),
  isPrivate: boolean("is_private").notNull().default(false),
  inviteCode: text("invite_code"),
  secretCode: text("secret_code").notNull(),
  prizeCoins: integer("prize_coins").notNull().default(500),
  prizeGems: integer("prize_gems").notNull().default(25),
  participants: jsonb("participants").$type<HuntParticipant[]>().notNull().default([]),
  bracketMatches: jsonb("bracket_matches").$type<unknown[]>().notNull().default([]),
  createdBy: text("created_by").notNull(),
  endsAt: timestamp("ends_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderAvatar: text("sender_avatar").notNull().default(""),
  senderAvatarConfig: jsonb("sender_avatar_config").$type<AvatarConfig>(),
  receiverId: integer("receiver_id"), // null = global chat
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Private per-room match chat (only the two players). */
export const matchChatMessages = pgTable("match_chat_messages", {
  id: serial("id").primaryKey(),
  roomCode: text("room_code").notNull(),
  senderSlot: integer("sender_slot").notNull(),
  senderName: text("sender_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const matchReactions = pgTable("match_reactions", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().default(0),
  roomCode: text("room_code").notNull(),
  senderId: integer("sender_id"),
  senderSlot: integer("sender_slot").notNull().default(1),
  senderName: text("sender_name").notNull(),
  emoji: text("emoji").notNull(), // reaction id in v3 (e.g. "fire")
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id"),
  username: text("username").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id"),
  username: text("username").notNull(),
  kind: text("kind").notNull().default("other"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Idempotency log so a match result can never be double-paid. */
export const resultLog = pgTable("result_log", {
  id: serial("id").primaryKey(),
  resultId: text("result_id").notNull().unique(),
  playerId: integer("player_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ---------------------------- v4 social update ---------------------------- */

export interface HuntParticipant {
  key: string; // "p<playerId>" for registered, "g<guestKey>" for guests
  playerId: number | null;
  username: string;
  avatar: AvatarConfig;
  guesses: { guess: string; points: number; orders: number }[];
  solved: boolean;
  solvedAt?: string;
  joinedAt: string;
}

/** 1v1 challenges + rematches between registered players. */
export const matchInvites = pgTable("match_invites", {
  id: serial("id").primaryKey(),
  fromPlayerId: integer("from_player_id").notNull(),
  toPlayerId: integer("to_player_id").notNull(),
  fromName: text("from_name").notNull(),
  fromAvatarConfig: jsonb("from_avatar_config").$type<AvatarConfig>(),
  fromFrame: text("from_frame").notNull().default("frame_emerald"),
  timerSeconds: integer("timer_seconds").notNull().default(45),
  kind: text("kind").notNull().default("challenge"), // "challenge" | "rematch"
  status: text("status").notNull().default("pending"), // pending | accepted | declined | expired | cancelled
  roomCode: text("room_code"),
  p1Token: text("p1_token"),
  p2Token: text("p2_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

/** Durable per-player match records powering replays + head-to-head stats. */
export const matchHistory = pgTable("match_history", {
  id: serial("id").primaryKey(),
  historyId: text("history_id").notNull().unique(),
  playerId: integer("player_id").notNull(),
  opponentPlayerId: integer("opponent_player_id"),
  opponentName: text("opponent_name").notNull(),
  opponentAvatar: jsonb("opponent_avatar").$type<AvatarConfig>(),
  myAvatar: jsonb("my_avatar").$type<AvatarConfig>(),
  mode: text("mode").notNull().default("ai"),
  result: text("result").notNull().default("win"), // win | loss | draw
  mySecret: text("my_secret").notNull().default(""),
  oppSecret: text("opp_secret").notNull().default(""),
  guesses: jsonb("guesses").$type<MatchGuessEntry[]>().notNull().default([]),
  endReason: text("end_reason"),
  turnsTaken: integer("turns_taken").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Web Push subscriptions (one per browser/device). */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
