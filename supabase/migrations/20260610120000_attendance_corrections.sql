-- Migration: Attendance Correction Requests
-- Allows employees to request corrections to wrong check-in/out times.
-- On admin approval the attendance record is patched with proposed times.

CREATE TABLE IF NOT EXISTS public.attendance_corrections (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attendance_id       UUID        NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  original_check_in   TIMESTAMPTZ NOT NULL,
  original_check_out  TIMESTAMPTZ,
  proposed_check_in   TIMESTAMPTZ NOT NULL,
  proposed_check_out  TIMESTAMPTZ,
  reason              TEXT        NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  status              TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  admin_note          TEXT,
  reviewed_by         UUID        REFERENCES auth.users(id),
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corrections_user_id ON public.attendance_corrections (user_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status  ON public.attendance_corrections (status);
CREATE INDEX IF NOT EXISTS idx_corrections_attendance_id ON public.attendance_corrections (attendance_id);

CREATE OR REPLACE FUNCTION update_corrections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_corrections_updated_at ON public.attendance_corrections;
CREATE TRIGGER trg_corrections_updated_at
  BEFORE UPDATE ON public.attendance_corrections
  FOR EACH ROW EXECUTE FUNCTION update_corrections_updated_at();

ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own corrections"
  ON public.attendance_corrections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own corrections"
  ON public.attendance_corrections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can cancel own pending corrections"
  ON public.attendance_corrections FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');
