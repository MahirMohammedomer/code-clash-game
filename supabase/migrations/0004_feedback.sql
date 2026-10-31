-- Run after backing up. Reviews remain hidden until manually approved.
CREATE TABLE IF NOT EXISTS public.feedback (
  id BIGSERIAL PRIMARY KEY,
  author TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL CHECK (char_length(comment) BETWEEN 1 AND 500),
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_approved_created_idx ON public.feedback (created_at DESC) WHERE approved;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
-- Moderation, from a trusted SQL editor only:
-- SELECT id, author, rating, comment, created_at FROM public.feedback WHERE NOT approved ORDER BY created_at DESC;
-- UPDATE public.feedback SET approved = true WHERE id = <review_id>;
