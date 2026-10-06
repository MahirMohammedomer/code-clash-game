-- Code Clash — Production Database Migration (Supabase / PostgreSQL)
-- Automatically applied when environment variables are connected or via `supabase db push`

CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  auth_provider TEXT NOT NULL DEFAULT 'local',
  avatar_emoji TEXT NOT NULL DEFAULT '🦉',
  title TEXT NOT NULL DEFAULT 'Code Breaker',
  frame_id TEXT NOT NULL DEFAULT 'frame_emerald',
  theme_id TEXT NOT NULL DEFAULT 'theme_classic',
  effect_id TEXT NOT NULL DEFAULT 'effect_confetti',
  division TEXT NOT NULL DEFAULT 'Bronze',
  trophies INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  season_xp INTEGER NOT NULL DEFAULT 0,
  has_premium_pass BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_free_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  claimed_premium_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  owned_cosmetics JSONB NOT NULL DEFAULT '["frame_emerald", "theme_classic", "effect_confetti", "title_breaker"]'::jsonb,
  completed_achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
  claimed_quests JSONB NOT NULL DEFAULT '[]'::jsonb,
  coins INTEGER NOT NULL DEFAULT 0,
  gems INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 1,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  total_games INTEGER NOT NULL DEFAULT 0,
  fastest_win_turns INTEGER,
  club_id INTEGER,
  is_online BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clubs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  badge_emoji TEXT NOT NULL DEFAULT '🛡️',
  description TEXT NOT NULL,
  total_trophies INTEGER NOT NULL DEFAULT 0,
  member_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS follows (
  id SERIAL PRIMARY KEY,
  follower_id INTEGER NOT NULL,
  following_id INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  room_code TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL DEFAULT 'online_1v1',
  status TEXT NOT NULL DEFAULT 'waiting',
  timer_seconds INTEGER NOT NULL DEFAULT 45,
  player1_id INTEGER,
  player1_name TEXT NOT NULL,
  player1_avatar TEXT NOT NULL DEFAULT '🦉',
  player1_division TEXT NOT NULL DEFAULT 'Bronze',
  player1_secret TEXT NOT NULL DEFAULT '',
  player2_id INTEGER,
  player2_name TEXT NOT NULL DEFAULT 'Waiting...',
  player2_avatar TEXT NOT NULL DEFAULT '⚔️',
  player2_division TEXT NOT NULL DEFAULT 'Bronze',
  player2_secret TEXT NOT NULL DEFAULT '',
  ai_difficulty TEXT,
  current_turn INTEGER NOT NULL DEFAULT 1,
  turn_started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  guesses JSONB NOT NULL DEFAULT '[]'::jsonb,
  winner_slot INTEGER,
  winner_name TEXT,
  tournament_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournaments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'mass_hunt',
  status TEXT NOT NULL DEFAULT 'live',
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  invite_code TEXT,
  secret_code TEXT NOT NULL,
  prize_coins INTEGER NOT NULL DEFAULT 500,
  prize_gems INTEGER NOT NULL DEFAULT 25,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  bracket_matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL,
  ends_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_players_trophies ON players(trophies DESC);
CREATE INDEX IF NOT EXISTS idx_matches_room_code ON matches(room_code);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL,
  sender_name TEXT NOT NULL,
  sender_avatar TEXT NOT NULL DEFAULT '🦉',
  receiver_id INTEGER,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_receiver ON chat_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_players_online ON players(is_online, last_seen_at DESC);
