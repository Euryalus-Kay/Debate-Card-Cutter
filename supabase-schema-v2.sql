-- DEBATE ROUND MANAGER SCHEMA ADDITIONS
-- Run this in Supabase SQL Editor AFTER the original schema

-- Card library collections (for bulk uploads like Michigan Theory Bible)
CREATE TABLE IF NOT EXISTS card_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_name TEXT NOT NULL,
  uploaded_by TEXT NOT NULL DEFAULT 'Anonymous',
  file_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add library_id and is_shared to cards table
ALTER TABLE cards ADD COLUMN IF NOT EXISTS library_id UUID REFERENCES card_library(id) ON DELETE SET NULL;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT true;

-- Rounds table
CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('aff', 'neg')),
  opponent_name TEXT NOT NULL DEFAULT '',
  opponent_school TEXT NOT NULL DEFAULT '',
  tournament TEXT NOT NULL DEFAULT '',
  round_number TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  round_context TEXT NOT NULL DEFAULT '',
  partner_name TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Speeches table
CREATE TABLE IF NOT EXISTS speeches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  speech_type TEXT NOT NULL,
  speaker TEXT NOT NULL CHECK (speaker IN ('user', 'opponent')),
  raw_content TEXT NOT NULL DEFAULT '',
  parsed_content JSONB DEFAULT '[]',
  generated_html TEXT DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'paste' CHECK (source_type IN ('paste', 'upload', 'generated')),
  source_filename TEXT,
  speech_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flow entries
CREATE TABLE IF NOT EXISTS flow_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  row_index INT NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'case',
  label TEXT NOT NULL DEFAULT '',
  entries JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Speech card selections (for "use these cards" feature)
CREATE TABLE IF NOT EXISTS speech_card_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  speech_type TEXT NOT NULL,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  instruction TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rounds_user ON rounds(user_name);
CREATE INDEX IF NOT EXISTS idx_rounds_partner ON rounds(partner_name);
CREATE INDEX IF NOT EXISTS idx_speeches_round ON speeches(round_id);
CREATE INDEX IF NOT EXISTS idx_flow_entries_round ON flow_entries(round_id);
CREATE INDEX IF NOT EXISTS idx_speech_card_selections_round ON speech_card_selections(round_id);
CREATE INDEX IF NOT EXISTS idx_cards_library ON cards(library_id);
CREATE INDEX IF NOT EXISTS idx_cards_shared ON cards(is_shared);

-- RLS policies
ALTER TABLE card_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE speeches ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE speech_card_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on card_library" ON card_library FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on rounds" ON rounds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on speeches" ON speeches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on flow_entries" ON flow_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on speech_card_selections" ON speech_card_selections FOR ALL USING (true) WITH CHECK (true);
