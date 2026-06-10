-- Migration: Leave Management System
-- Adds leave_types and leaves tables with RLS, indexes, and seed data.

-- ─── Leave Types ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leave_types (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL UNIQUE,
  description TEXT,
  color       TEXT        NOT NULL DEFAULT '#8b7cff',
  max_days    INTEGER,
  is_paid     BOOLEAN     NOT NULL DEFAULT true,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Default leave types every org needs
INSERT INTO public.leave_types (name, description, color, max_days, is_paid) VALUES
  ('Annual Leave',   'Planned vacation / paid time off',       '#3ee8c7', 21,   true),
  ('Sick Leave',     'Medical or health-related absence',       '#ffb347', 14,   true),
  ('Personal Leave', 'Personal matters and emergencies',        '#8b7cff', 5,    true),
  ('Unpaid Leave',   'Absence without pay',                     '#9ca3af', NULL, false)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active leave types"
  ON public.leave_types FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);

-- ─── Leaves ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leaves (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_type_id   UUID        NOT NULL REFERENCES public.leave_types(id),
  start_date      DATE        NOT NULL,
  end_date        DATE        NOT NULL,
  days            INTEGER     NOT NULL CHECK (days > 0),
  reason          TEXT        NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  admin_note      TEXT,
  reviewed_by     UUID        REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT leaves_dates_valid CHECK (end_date >= start_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leaves_user_id ON public.leaves (user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_status  ON public.leaves (status);
CREATE INDEX IF NOT EXISTS idx_leaves_dates   ON public.leaves (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leaves_user_status ON public.leaves (user_id, status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_leaves_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leaves_updated_at ON public.leaves;
CREATE TRIGGER trg_leaves_updated_at
  BEFORE UPDATE ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION update_leaves_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own leaves"
  ON public.leaves FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own leaves"
  ON public.leaves FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can cancel own pending leaves"
  ON public.leaves FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');
