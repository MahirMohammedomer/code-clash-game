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
