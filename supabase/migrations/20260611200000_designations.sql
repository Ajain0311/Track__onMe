-- Migration: Designations lookup table

CREATE TABLE IF NOT EXISTS designations (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  level      SMALLINT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 20),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name)
);

ALTER TABLE designations ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active designations
DROP POLICY IF EXISTS "designations_read" ON designations;
CREATE POLICY "designations_read" ON designations
  FOR SELECT TO authenticated USING (true);

-- Admin-only write
DROP POLICY IF EXISTS "designations_admin_write" ON designations;
CREATE POLICY "designations_admin_write" ON designations
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin','manager'))
  );

-- Seed common designations
INSERT INTO designations (name, level) VALUES
  ('Intern',                1),
  ('Junior Engineer',       2),
  ('Engineer',              3),
  ('Senior Engineer',       4),
  ('Tech Lead',             5),
  ('Engineering Manager',   6),
  ('Senior Manager',        7),
  ('Director',              8),
  ('Vice President',        9),
  ('C-Level',              10),
  ('Analyst',               2),
  ('Senior Analyst',        3),
  ('Associate',             2),
  ('Senior Associate',      3),
  ('Manager',               5),
  ('General Manager',       7),
  ('HR Executive',          3),
  ('HR Manager',            5),
  ('Finance Executive',     3),
  ('Finance Manager',       5)
ON CONFLICT (name) DO NOTHING;
