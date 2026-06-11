-- Migration: Leave Balance Tracking
-- Adds annual_days to leave_types and a leave_allowances table for per-user overrides.

-- ─── annual_days on leave_types (org-wide default) ────────────────────────────

ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS annual_days INTEGER NOT NULL DEFAULT 0;

-- Seed sensible defaults for existing types
UPDATE public.leave_types SET annual_days = 21  WHERE name = 'Annual Leave';
UPDATE public.leave_types SET annual_days = 14  WHERE name = 'Sick Leave';
UPDATE public.leave_types SET annual_days = 5   WHERE name = 'Personal Leave';
UPDATE public.leave_types SET annual_days = 0   WHERE name = 'Unpaid Leave';

-- ─── Per-user leave allowances (admin can override) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.leave_allowances (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_type_id UUID        NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year          INTEGER     NOT NULL,
  total_days    INTEGER     NOT NULL DEFAULT 0 CHECK (total_days >= 0),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, leave_type_id, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_allowances_user_year
  ON public.leave_allowances (user_id, year);

ALTER TABLE public.leave_allowances ENABLE ROW LEVEL SECURITY;

-- Users can read their own allowances; admins can read/write all
DROP POLICY IF EXISTS "Users can view own leave allowances" ON public.leave_allowances;
CREATE POLICY "Users can view own leave allowances"
  ON public.leave_allowances FOR SELECT
  USING (auth.uid() = user_id);

-- Service role (backend) handles inserts/updates via service key — no user-level write policy needed.

-- Auto update updated_at
CREATE OR REPLACE FUNCTION update_leave_allowances_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_allowances_updated_at ON public.leave_allowances;
CREATE TRIGGER trg_leave_allowances_updated_at
  BEFORE UPDATE ON public.leave_allowances
  FOR EACH ROW EXECUTE FUNCTION update_leave_allowances_updated_at();
