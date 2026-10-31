-- Non-destructive. Streaks count UTC calendar days with at least one completed game.
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS last_played_date TEXT;
