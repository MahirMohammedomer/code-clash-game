-- ============================================================
-- CIPHER CLASH v3 (rebuild) — run this once in Supabase SQL Editor.
-- Safe to run multiple times (all statements are idempotent).
-- It ADDS columns/tables and never drops your existing player data.
-- ============================================================

-- ---------- players: new columns ----------
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS avatar_config    JSONB NOT NULL DEFAULT '{"base":"owl","color":"classic","accessory":"none"}'::jsonb,
  ADD COLUMN IF NOT EXISTS claimed_daily_quests JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS daily_stats      JSONB,
  ADD COLUMN IF NOT EXISTS daily_challenge_done TEXT,
  ADD COLUMN IF NOT EXISTS last_play_date   TEXT,
  ADD COLUMN IF NOT EXISTS tutorial_seen    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_admin         BOOLEAN NOT NULL DEFAULT FALSE;

-- Give every existing player the free starter avatar parts in their inventory
UPDATE public.players
SET owned_cosmetics = (
  SELECT jsonb_agg(DISTINCT v)
  FROM jsonb_array_elements_text(
    owned_cosmetics || '["base_owl","color_classic","acc_none"]'::jsonb
  ) AS v
)
WHERE NOT (owned_cosmetics @> '["base_owl"]'::jsonb);

-- ---------- matches: reliability columns ----------
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS player1_avatar_config JSONB,
  ADD COLUMN IF NOT EXISTS player2_avatar_config JSONB,
  ADD COLUMN IF NOT EXISTS player1_frame TEXT NOT NULL DEFAULT 'frame_emerald',
  ADD COLUMN IF NOT EXISTS player2_frame TEXT NOT NULL DEFAULT 'frame_emerald',
  ADD COLUMN IF NOT EXISTS p1_token TEXT,
  ADD COLUMN IF NOT EXISTS p2_token TEXT,
  ADD COLUMN IF NOT EXISTS p1_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS p2_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_reason TEXT;

-- ---------- chat: avatar config ----------
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS sender_avatar_config JSONB;

ALTER TABLE public.match_reactions
  ADD COLUMN IF NOT EXISTS sender_slot INTEGER NOT NULL DEFAULT 1;

-- ---------- private match chat ----------
CREATE TABLE IF NOT EXISTS public.match_chat_messages (
  id SERIAL PRIMARY KEY,
  room_code TEXT NOT NULL,
  sender_slot INTEGER NOT NULL,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- reviews (public only after admin approval) ----------
CREATE TABLE IF NOT EXISTS public.reviews (
  id SERIAL PRIMARY KEY,
  player_id INTEGER,
  username TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- feedback inbox ----------
CREATE TABLE IF NOT EXISTS public.feedback (
  id SERIAL PRIMARY KEY,
  player_id INTEGER,
  username TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- match-result idempotency (prevents double rewards) ----------
CREATE TABLE IF NOT EXISTS public.result_log (
  id SERIAL PRIMARY KEY,
  result_id TEXT NOT NULL UNIQUE,
  player_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- indexes for speed ----------
CREATE INDEX IF NOT EXISTS idx_players_trophies      ON public.players (trophies DESC);
CREATE INDEX IF NOT EXISTS idx_players_online        ON public.players (is_online, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_room_code     ON public.matches (room_code);
CREATE INDEX IF NOT EXISTS idx_matches_waiting       ON public.matches (status, is_private, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_chat_room       ON public.match_chat_messages (room_code, id);
CREATE INDEX IF NOT EXISTS idx_match_reactions_room  ON public.match_reactions (room_code, id);
CREATE INDEX IF NOT EXISTS idx_reviews_status        ON public.reviews (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_created      ON public.feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_follower      ON public.follows (follower_id);

-- ---------- clean up dead rooms (waiting > 1 day) ----------
UPDATE public.matches
SET status = 'abandoned'
WHERE status IN ('waiting','setup') AND created_at < NOW() - INTERVAL '1 day';

-- ============================================================
-- Done! To make YOURSELF admin (approve reviews, read feedback):
-- Option A (recommended): set ADMIN_USERNAMES=YourGameName in Vercel env vars.
-- Option B: run this line with your username:
--   UPDATE public.players SET is_admin = TRUE WHERE username = 'YourGameName';
-- ============================================================
