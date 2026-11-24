-- ============================================================================
-- CIPHER CLASH — full schema for the REAL game Supabase project
-- Project ref: xeqogvffitidtjjhlpsq   (the one npo.pro.et actually uses)
--
-- HOW TO RUN
--   1. Supabase dashboard → select the GAME project (xeqogvffitidtjjhlpsq)
--   2. SQL Editor → New query → paste this whole file → Run
--
-- SAFETY
--   * Every statement is idempotent (IF NOT EXISTS / IF NOT EXISTS columns),
--     so running it any number of times is safe and never drops data.
--   * The app also auto-applies this same schema on boot, so most of it will
--     no-op. The real work done here is:
--       - rename `reviews` → `game_reviews` (new code name; old data moves over)
--       - create anything the boot migrator hasn't reached yet (v4.2 extras)
-- ============================================================================

-- ============================================================================
-- STEP 0 — rename the old `reviews` table to `game_reviews` (keeps all data)
-- The deployed code reads/writes `game_reviews` now. The boot migrator already
-- created an EMPTY game_reviews on this project, so we also copy any old rows
-- across, then drop the old table.
-- ============================================================================

DO $$
DECLARE
  moved_count integer;
BEGIN
  IF to_regclass('public.reviews') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'reviews'
         AND column_name = 'comment'          -- game table fingerprint
     )
  THEN
    IF to_regclass('public.game_reviews') IS NULL THEN
      CREATE TABLE public.game_reviews (
        id SERIAL PRIMARY KEY,
        player_id INTEGER,
        username TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    END IF;

    -- copy old rows that are not already present (idempotent on re-runs)
    INSERT INTO public.game_reviews (player_id, username, rating, comment, status, created_at)
    SELECT r.player_id, r.username, r.rating, r.comment, r.status, r.created_at
    FROM public.reviews r
    WHERE NOT EXISTS (
      SELECT 1 FROM public.game_reviews g
      WHERE g.username = r.username AND g.comment = r.comment AND g.created_at = r.created_at
    );
    GET DIAGNOSTICS moved_count = ROW_COUNT;

    DROP TABLE public.reviews;
    RAISE NOTICE 'reviews → game_reviews complete. Rows moved: %', moved_count;
  ELSE
    RAISE NOTICE 'No legacy game reviews table found — skipping rename.';
  END IF;
END $$;


-- ============================================================================
-- MIGRATION 0001 — base tables (players, clubs, matches, tournaments, chat)
-- ============================================================================

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

-- ============================================================================
-- MIGRATION 0002 — reactions
-- ============================================================================

-- Chat + reactions + indexes for Code Clash v2

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL,
  sender_name TEXT NOT NULL,
  sender_avatar TEXT NOT NULL DEFAULT '🦉',
  receiver_id INTEGER,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_reactions (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL DEFAULT 0,
  room_code TEXT NOT NULL,
  sender_id INTEGER,
  sender_name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_receiver ON chat_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_match_reactions_room ON match_reactions(room_code);
CREATE INDEX IF NOT EXISTS idx_players_online ON players(is_online, last_seen_at DESC);

-- ============================================================================
-- MIGRATION 0003 — v3 rebuild (avatars, match reliability, feedback, result log)
-- ============================================================================

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
CREATE TABLE IF NOT EXISTS public.game_reviews (
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
CREATE INDEX IF NOT EXISTS idx_game_reviews_status   ON public.game_reviews (status, created_at DESC);
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

-- ============================================================================
-- MIGRATION 0004 — v4 social (invites, history, push, seasons)
-- ============================================================================

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

-- ============================================================================
-- MIGRATION 0005 — v4.2 (clans, shields, career, referrals, sound themes)
-- ============================================================================

-- Cipher Clash v4.2 — clans, streak shields, career mode, referrals, sound themes

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS streak_shields INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pinned_achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sound_theme TEXT NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS referral_code TEXT,
  ADD COLUMN IF NOT EXISTS referred_by TEXT,
  ADD COLUMN IF NOT EXISTS referral_rewarded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS career_claimed JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS club_joined_at TIMESTAMPTZ;

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS weekly_goal INTEGER NOT NULL DEFAULT 2000;

CREATE TABLE IF NOT EXISTS public.clan_messages (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  sender_name TEXT NOT NULL,
  sender_avatar_config JSONB,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clan_msg ON public.clan_messages(club_id, id);

CREATE TABLE IF NOT EXISTS public.gift_log (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'coins',
  day TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sender_id, target_id, kind, day)
);
CREATE INDEX IF NOT EXISTS idx_gift_target ON public.gift_log(target_id, day);

-- ============================================================================
-- FINAL — refresh PostgREST cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY — run these if you like; expected results are shown
-- ============================================================================

-- 1) v4.2 player columns exist → should return 8 rows:
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'players'
  AND column_name IN ('streak_shields','pinned_achievements','sound_theme',
                      'referral_code','referred_by','referral_rewarded',
                      'career_claimed','club_joined_at')
ORDER BY column_name;

-- 2) game_reviews exists and holds the migrated data:
SELECT count(*) AS total_reviews FROM public.game_reviews;

-- 3) all expected game tables (should list 16 rows):
SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('players','clubs','follows','matches','tournaments',
    'chat_messages','match_reactions','match_chat_messages','game_reviews',
    'feedback','result_log','match_invites','match_history',
    'push_subscriptions','clan_messages','gift_log')
ORDER BY tablename;
