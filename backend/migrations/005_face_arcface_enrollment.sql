-- ============================================================
-- Migration 005: ArcFace embeddings + manager-approved enrollment
--
-- Replaces the old geometric-ratio face templates with deep
-- ArcFace-family embeddings (computed on-device, compared by
-- cosine similarity on the server) and adds a manager-approval
-- workflow before a new face becomes active.
--
-- BREAKING: all existing face templates are wiped. Every user
-- must re-enroll (2 images) and be approved by a manager before
-- they can check in again. The old __v:2 geometric format is
-- rejected by the backend after this migration.
-- ============================================================

-- 1. Wipe legacy geometric templates ("reset all" rollout).
--    user_face_data now holds only ACTIVE, manager-APPROVED embeddings.
TRUNCATE TABLE user_face_data;

-- 2. Extend the active-face table.
--    A row's existence == the user's face is approved and active.
--    features JSONB now stores { __v:3, model, dim, embeddings:[[...],[...]], sampleCount }.
ALTER TABLE user_face_data
  ADD COLUMN IF NOT EXISTS model        TEXT,
  ADD COLUMN IF NOT EXISTS dim          INTEGER,
  ADD COLUMN IF NOT EXISTS approved_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ;

-- 3. Pending/approved/rejected enrollment submissions.
--    Mirrors the location_requests approval pattern. The active
--    embeddings only land in user_face_data once a manager approves.
CREATE TABLE IF NOT EXISTS face_enrollment_requests (
  id           UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload      JSONB        NOT NULL,   -- { __v:3, model, dim, embeddings:[[...],[...]], sampleCount, quality }
  model        TEXT,
  dim          INTEGER,
  status       TEXT         NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note   TEXT,
  reviewed_by  UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_face_enroll_status  ON face_enrollment_requests(status);
CREATE INDEX IF NOT EXISTS idx_face_enroll_user_id ON face_enrollment_requests(user_id);
-- At most one pending submission per user (re-submitting replaces it).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_face_enroll_pending_user
  ON face_enrollment_requests(user_id) WHERE status = 'pending';

-- RLS: owner may read their own enrollment requests; the backend
-- service-role key bypasses RLS for all admin/approval operations.
ALTER TABLE face_enrollment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_face_enrollments" ON face_enrollment_requests;
CREATE POLICY "users_read_own_face_enrollments"
  ON face_enrollment_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 4. Keep updated_at fresh (reuse the function created in migration 004).
DROP TRIGGER IF EXISTS update_face_enrollment_updated_at ON face_enrollment_requests;
CREATE TRIGGER update_face_enrollment_updated_at
  BEFORE UPDATE ON face_enrollment_requests
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
