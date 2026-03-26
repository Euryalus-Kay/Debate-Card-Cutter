-- Run this SQL in your Supabase SQL Editor to set up the database

-- Cards table
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag TEXT NOT NULL,
  cite TEXT NOT NULL,
  cite_author TEXT NOT NULL DEFAULT '',
  cite_year TEXT NOT NULL DEFAULT '',
  cite_credentials TEXT NOT NULL DEFAULT '',
  cite_title TEXT NOT NULL DEFAULT '',
  cite_date TEXT NOT NULL DEFAULT '',
  cite_url TEXT NOT NULL DEFAULT '',
  cite_access_date TEXT NOT NULL DEFAULT '',
  cite_initials TEXT NOT NULL DEFAULT '',
  evidence_html TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT 'Anonymous',
  argument_id UUID REFERENCES arguments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Arguments table (groups of cards)
CREATE TABLE IF NOT EXISTS arguments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT 'Anonymous',
  card_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User contexts (persistent context per user)
CREATE TABLE IF NOT EXISTS user_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name TEXT NOT NULL UNIQUE,
  context TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable realtime for cards
ALTER TABLE cards REPLICA IDENTITY FULL;
ALTER TABLE arguments REPLICA IDENTITY FULL;

-- Row Level Security (open for private use)
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE arguments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on cards" ON cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on arguments" ON arguments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on user_contexts" ON user_contexts FOR ALL USING (true) WITH CHECK (true);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_cards_author ON cards(author_name);
CREATE INDEX IF NOT EXISTS idx_cards_created ON cards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_argument ON cards(argument_id);
