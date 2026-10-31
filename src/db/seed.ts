import { getPool } from "@/db";

let schemaInitialized = false;

/**
 * Automatically migrates the PostgreSQL / Supabase database tables and indexes
 * as soon as the database environment variables are connected.
 * Does NOT insert any fake or placeholder records.
 */
export async function ensureDatabaseReady() {
  if (schemaInitialized) return;

  try {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.players (
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

      CREATE TABLE IF NOT EXISTS public.clubs (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        tag TEXT NOT NULL,
        badge_emoji TEXT NOT NULL DEFAULT '🛡️',
        description TEXT NOT NULL,
        total_trophies INTEGER NOT NULL DEFAULT 0,
        member_count INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.follows (
        id SERIAL PRIMARY KEY,
        follower_id INTEGER NOT NULL,
        following_id INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.matches (
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

      CREATE TABLE IF NOT EXISTS public.tournaments (
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

      CREATE TABLE IF NOT EXISTS public.chat_messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL,
        sender_name TEXT NOT NULL,
        sender_avatar TEXT NOT NULL DEFAULT '🦉',
        receiver_id INTEGER,
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_players_trophies ON public.players(trophies DESC);
      CREATE INDEX IF NOT EXISTS idx_matches_room_code ON public.matches(room_code);
      CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);
      CREATE INDEX IF NOT EXISTS idx_chat_created ON public.chat_messages(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_players_online ON public.players(is_online, last_seen_at DESC);
      CREATE TABLE IF NOT EXISTS public.match_reactions (
        id SERIAL PRIMARY KEY,
        match_id INTEGER NOT NULL DEFAULT 0,
        room_code TEXT NOT NULL,
        sender_id INTEGER,
        sender_name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_match_reactions_room ON public.match_reactions(room_code);

      -- ===== Cipher Clash v3 upgrade (same as supabase/migrations/0003) =====
      ALTER TABLE public.players
        ADD COLUMN IF NOT EXISTS avatar_config JSONB NOT NULL DEFAULT '{"base":"owl","color":"classic","accessory":"none"}'::jsonb,
        ADD COLUMN IF NOT EXISTS claimed_daily_quests JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS daily_stats JSONB,
        ADD COLUMN IF NOT EXISTS daily_challenge_done TEXT,
        ADD COLUMN IF NOT EXISTS last_play_date TEXT,
        ADD COLUMN IF NOT EXISTS tutorial_seen BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

      UPDATE public.players
      SET owned_cosmetics = (
        SELECT jsonb_agg(DISTINCT v)
        FROM jsonb_array_elements_text(owned_cosmetics || '["base_owl","color_classic","acc_none"]'::jsonb) AS v
      )
      WHERE NOT (owned_cosmetics @> '["base_owl"]'::jsonb);

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

      ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS sender_avatar_config JSONB;
      ALTER TABLE public.match_reactions ADD COLUMN IF NOT EXISTS sender_slot INTEGER NOT NULL DEFAULT 1;

      CREATE TABLE IF NOT EXISTS public.match_chat_messages (
        id SERIAL PRIMARY KEY,
        room_code TEXT NOT NULL,
        sender_slot INTEGER NOT NULL,
        sender_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.reviews (
        id SERIAL PRIMARY KEY,
        player_id INTEGER,
        username TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.feedback (
        id SERIAL PRIMARY KEY,
        player_id INTEGER,
        username TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'other',
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.result_log (
        id SERIAL PRIMARY KEY,
        result_id TEXT NOT NULL UNIQUE,
        player_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_matches_waiting ON public.matches(status, is_private, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_match_chat_room ON public.match_chat_messages(room_code, id);
      CREATE INDEX IF NOT EXISTS idx_reviews_status ON public.reviews(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_feedback_created ON public.feedback(created_at DESC);

      NOTIFY pgrst, 'reload schema';
    `);
    schemaInitialized = true;
  } catch (e) {
    console.error("Database auto-migration error:", e);
    throw e;
  }
}
