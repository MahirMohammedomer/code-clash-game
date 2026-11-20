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
