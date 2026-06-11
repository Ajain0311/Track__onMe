-- Migration: Face verification — user_face_data table and attendance audit columns
-- Idempotent; safe to re-run.

-- ─── User Face Data ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_face_data (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  features      JSONB       NOT NULL,
  sample_count  INTEGER     NOT NULL DEFAULT 1,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_face_data_user_id ON public.user_face_data (user_id);

ALTER TABLE public.user_face_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_face_data" ON public.user_face_data;
CREATE POLICY "users_read_own_face_data"
  ON public.user_face_data FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_user_face_data_updated_at ON public.user_face_data;
CREATE TRIGGER update_user_face_data_updated_at
  BEFORE UPDATE ON public.user_face_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Attendance: face verification + location columns ────────────────────────

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS face_verified            BOOLEAN          DEFAULT false,
  ADD COLUMN IF NOT EXISTS face_similarity_score    DOUBLE PRECISION DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS face_verification_method TEXT             DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS latitude                 DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude                DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS accuracy                 DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS check_in_method          TEXT,
  ADD COLUMN IF NOT EXISTS location_id              UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_name            TEXT;

CREATE INDEX IF NOT EXISTS idx_attendance_location_id
  ON public.attendance (location_id);
