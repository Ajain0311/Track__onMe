-- ============================================================
-- Migration 004: Server-side face verification
-- Stores face embeddings in DB; adds verification audit
-- columns to attendance records.
-- ============================================================

-- 1. Store face feature embeddings server-side (JSONB).
--    One row per user; UPSERT on conflict.
CREATE TABLE IF NOT EXISTS user_face_data (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID         NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  features      JSONB        NOT NULL,   -- { __v:2, ratios:{...}, sampleCount:N }
  sample_count  INTEGER      NOT NULL DEFAULT 1,
  registered_at TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_face_data_user_id ON user_face_data(user_id);

-- RLS: only the owner may read their own face data row.
-- Backend service-role key bypasses RLS for all operations.
ALTER TABLE user_face_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_face_data" ON user_face_data;
CREATE POLICY "users_read_own_face_data"
  ON user_face_data FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2. Attendance audit columns.
--    face_verified          — was a face/web verification token validated?
--    face_similarity_score  — server-side similarity (0-1); 1.0 = web-password auth
--    face_verification_method — 'face_recognition' | 'web_password'
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS face_verified             BOOLEAN          DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS face_similarity_score     DOUBLE PRECISION DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS face_verification_method  TEXT             DEFAULT NULL;

-- 3. Also guard against missing base columns (no-op if already present
--    from supabase/migrations/).
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS latitude        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS accuracy        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS check_in_method TEXT,
  ADD COLUMN IF NOT EXISTS location_id     UUID REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_name   TEXT;

-- 4. Trigger: auto-update updated_at on user_face_data rows
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_face_data_updated_at ON user_face_data;
CREATE TRIGGER update_user_face_data_updated_at
  BEFORE UPDATE ON user_face_data
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
