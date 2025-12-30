-- TV Theme Hipster Game Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Shows table
CREATE TABLE shows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  show_name TEXT NOT NULL,
  network TEXT NOT NULL,
  artist TEXT NOT NULL,
  premiere_year INTEGER NOT NULL,
  youtube_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lobbies table
CREATE TABLE lobbies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  join_code TEXT UNIQUE NOT NULL,
  host_player_id UUID,
  status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting', 'playing', 'finished'
  target_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players table
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lobby_id UUID NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  seat INTEGER, -- NULL until game starts, then 0-based seat number
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lobby_id, seat) -- Ensure unique seats per lobby
);

-- Game state table (one row per active game)
CREATE TABLE game_state (
  lobby_id UUID PRIMARY KEY REFERENCES lobbies(id) ON DELETE CASCADE,
  current_round_number INTEGER NOT NULL DEFAULT 1,
  current_guesser_seat INTEGER, -- seat of player whose turn it is
  current_dj_seat INTEGER, -- seat of DJ (guesser's left)
  current_attempt_seat INTEGER, -- seat of player currently attempting guess
  show_id UUID REFERENCES shows(id),
  round_state TEXT NOT NULL DEFAULT 'dj_ready', -- 'dj_ready', 'guessing', 'revealed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timelines table (stores each year as a separate row to allow duplicates)
CREATE TABLE timelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lobby_id UUID NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  year_value INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attempts table
CREATE TABLE attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lobby_id UUID NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  attempt_order INTEGER NOT NULL, -- order within the round (0 = first guesser, 1 = second, etc.)
  guess_type TEXT NOT NULL, -- 'before', 'between', 'after'
  x_year INTEGER NOT NULL,
  y_year INTEGER, -- NULL for 'before' and 'after', required for 'between'
  is_correct BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for performance
CREATE INDEX idx_lobbies_join_code ON lobbies(join_code);
CREATE INDEX idx_players_lobby_id ON players(lobby_id);
CREATE INDEX idx_players_lobby_seat ON players(lobby_id, seat);
CREATE INDEX idx_timelines_lobby_player ON timelines(lobby_id, player_id);
CREATE INDEX idx_timelines_player_year ON timelines(player_id, year_value);
CREATE INDEX idx_attempts_lobby_round ON attempts(lobby_id, round_number);
CREATE INDEX idx_shows_premiere_year ON shows(premiere_year);

-- RLS Policies

-- Enable RLS on all tables
ALTER TABLE shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;

-- Shows: Public read access
CREATE POLICY "Anyone can read shows" ON shows
  FOR SELECT USING (true);

-- Lobbies: Read if you know the join_code (we'll check this in app logic)
-- For MVP, allow read access to all lobbies (join_code provides security)
CREATE POLICY "Anyone can read lobbies" ON lobbies
  FOR SELECT USING (true);

-- Players: Read players in a lobby (anyone can see who's in a lobby)
CREATE POLICY "Anyone can read players in lobbies" ON players
  FOR SELECT USING (true);

-- Players: Insert/update own player (we'll validate in server actions)
CREATE POLICY "Anyone can insert players" ON players
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update players" ON players
  FOR UPDATE USING (true);

-- Game state: Read access for anyone
CREATE POLICY "Anyone can read game state" ON game_state
  FOR SELECT USING (true);

-- Game state: Only service role can insert/update (enforced in server actions)
CREATE POLICY "Service role can manage game state" ON game_state
  FOR ALL USING (false); -- This will be bypassed by service role key

-- Timelines: Read access for anyone in the lobby
CREATE POLICY "Anyone can read timelines" ON timelines
  FOR SELECT USING (true);

-- Timelines: Insert/update via server actions only (service role)
CREATE POLICY "Service role can manage timelines" ON timelines
  FOR ALL USING (false); -- This will be bypassed by service role key

-- Attempts: Read access for anyone
CREATE POLICY "Anyone can read attempts" ON attempts
  FOR SELECT USING (true);

-- Attempts: Insert via server actions only (service role)
CREATE POLICY "Service role can manage attempts" ON attempts
  FOR ALL USING (false); -- This will be bypassed by service role key

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for game_state updated_at
CREATE TRIGGER update_game_state_updated_at BEFORE UPDATE ON game_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

