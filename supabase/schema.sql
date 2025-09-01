CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week INTEGER NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  status TEXT DEFAULT 'scheduled' -- 'scheduled', 'finished'
);

-- Picks table
CREATE TABLE IF NOT EXISTS picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  week INTEGER NOT NULL,
  team TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'win', 'loss'
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id, week)
);