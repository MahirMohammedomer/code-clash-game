-- ============================================================================
-- Cipher Clash v4 — Social Update
-- Adds: match invites (challenges/rematches), match history (replays),
-- push subscriptions, ranked-season columns, Daily Code + race mode support.
-- Idempotent: safe to run multiple times. Never drops player data.
-- (The app also auto-applies this on boot via src/db/seed.ts — running it
-- manually here is optional but recommended.)
-- ============================================================================

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS daily_code_done TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS season_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS season_peak_trophies INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS race_code TEXT;

CREATE TABLE IF NOT EXISTS public.match_invites (
  id SERIAL PRIMARY KEY,
  from_player_id INTEGER NOT NULL,
  to_player_id INTEGER NOT NULL,
  from_name TEXT NOT NULL,
  from_avatar_config JSONB,
  from_frame TEXT NOT NULL DEFAULT 'frame_emerald',
  timer_seconds INTEGER NOT NULL DEFAULT 45,
  kind TEXT NOT NULL DEFAULT 'challenge',
  status TEXT NOT NULL DEFAULT 'pending',
  room_code TEXT,
  p1_token TEXT,
  p2_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invites_to ON public.match_invites(to_player_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invites_from ON public.match_invites(from_player_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.match_history (
  id SERIAL PRIMARY KEY,
  history_id TEXT NOT NULL UNIQUE,
  player_id INTEGER NOT NULL,
  opponent_player_id INTEGER,
  opponent_name TEXT NOT NULL,
  opponent_avatar JSONB,
  my_avatar JSONB,
  mode TEXT NOT NULL DEFAULT 'ai',
  result TEXT NOT NULL DEFAULT 'win',
  my_secret TEXT NOT NULL DEFAULT '',
  opp_secret TEXT NOT NULL DEFAULT '',
  guesses JSONB NOT NULL DEFAULT '[]'::jsonb,
  end_reason TEXT,
  turns_taken INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_history_player ON public.match_history(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_h2h ON public.match_history(player_id, opponent_player_id);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_player ON public.push_subscriptions(player_id);

NOTIFY pgrst, 'reload schema';
