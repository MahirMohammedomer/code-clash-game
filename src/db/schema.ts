import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

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

export interface TournamentParticipant {
  playerId: number;
  username: string;
  avatarEmoji: string;
  division: string;
  attempts: number;
  solved: boolean;
  bestPoints: number;
  bestOrders: number;
  timeSeconds: number;
}

export interface BracketDuel {
  id: string;
  round: number;
  label: string;
  player1Name: string;
  player1Emoji: string;
  player2Name: string;
  player2Emoji: string;
  score1: number;
  score2: number;
  winnerName: string | null;
  status: "completed" | "live" | "upcoming";
}

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull().default(""),
  authProvider: text("auth_provider").notNull().default("local"), // 'local' | 'google' | 'guest'
  avatarEmoji: text("avatar_emoji").notNull().default("🦉"),
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
    .default([
      "frame_emerald",
      "theme_classic",
      "effect_confetti",
      "title_breaker",
    ]),
  completedAchievements: jsonb("completed_achievements")
    .$type<string[]>()
    .notNull()
    .default([]),
  claimedQuests: jsonb("claimed_quests").$type<string[]>().notNull().default([]),
  coins: integer("coins").notNull().default(0),
  gems: integer("gems").notNull().default(0),
  streakDays: integer("streak_days").notNull().default(1),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  totalGames: integer("total_games").notNull().default(0),
  fastestWinTurns: integer("fastest_win_turns"),
  clubId: integer("club_id"),
  isOnline: boolean("is_online").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const clubs = pgTable("clubs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tag: text("tag").notNull(),
  badgeEmoji: text("badge_emoji").notNull().default("🛡️"),
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
  mode: text("mode").notNull().default("online_1v1"), // 'online_1v1' | 'ai' | 'hotseat' | 'local_offline' | 'tournament'
  status: text("status").notNull().default("waiting"), // 'waiting' | 'setup' | 'playing' | 'finished'
  timerSeconds: integer("timer_seconds").notNull().default(45),
  player1Id: integer("player1_id"),
  player1Name: text("player1_name").notNull(),
  player1Avatar: text("player1_avatar").notNull().default("🦉"),
  player1Division: text("player1_division").notNull().default("Bronze"),
  player1Secret: text("player1_secret").notNull().default(""),
  player2Id: integer("player2_id"),
  player2Name: text("player2_name").notNull().default("Waiting..."),
  player2Avatar: text("player2_avatar").notNull().default("⚔️"),
  player2Division: text("player2_division").notNull().default("Bronze"),
  player2Secret: text("player2_secret").notNull().default(""),
  aiDifficulty: text("ai_difficulty"),
  currentTurn: integer("current_turn").notNull().default(1),
  turnStartedAt: timestamp("turn_started_at").defaultNow().notNull(),
  guesses: jsonb("guesses").$type<MatchGuessEntry[]>().notNull().default([]),
  winnerSlot: integer("winner_slot"),
  winnerName: text("winner_name"),
  tournamentId: integer("tournament_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tournaments = pgTable("tournaments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("mass_hunt"), // 'mass_hunt' | 'bracket'
  status: text("status").notNull().default("live"), // 'open' | 'live' | 'completed'
  isPrivate: boolean("is_private").notNull().default(false),
  inviteCode: text("invite_code"),
  secretCode: text("secret_code").notNull(),
  prizeCoins: integer("prize_coins").notNull().default(500),
  prizeGems: integer("prize_gems").notNull().default(25),
  participants: jsonb("participants").$type<TournamentParticipant[]>().notNull().default([]),
  bracketMatches: jsonb("bracket_matches").$type<BracketDuel[]>().notNull().default([]),
  createdBy: text("created_by").notNull(),
  endsAt: timestamp("ends_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Global + private chat messages
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderAvatar: text("sender_avatar").notNull().default("🦉"),
  receiverId: integer("receiver_id"), // null = global chat
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Match reactions (emoji reactions during a live game)
export const matchReactions = pgTable("match_reactions", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  roomCode: text("room_code").notNull(),
  senderId: integer("sender_id"),
  senderName: text("sender_name").notNull(),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
