-- Migration: Departments and Employee Profiles
-- Adds organizational structure and rich employee profile data.

-- ─── Departments ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.departments (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT,
  color       TEXT        NOT NULL DEFAULT '#8b7cff',
  manager_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT departments_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_departments_active ON public.departments (is_active);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view active departments (for profile editing)
DROP POLICY IF EXISTS "Authenticated users can view departments" ON public.departments;
CREATE POLICY "Authenticated users can view departments"
  ON public.departments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ─── Employee Profiles ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.employee_profiles (
  user_id       UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT        CHECK (char_length(display_name) <= 100),
  phone         TEXT        CHECK (char_length(phone) <= 30),
  department_id UUID        REFERENCES public.departments(id) ON DELETE SET NULL,
  designation   TEXT        CHECK (char_length(designation) <= 100),
  employee_id   TEXT        CHECK (char_length(employee_id) <= 50),
  joined_date   DATE,
  bio           TEXT        CHECK (char_length(bio) <= 500),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_department ON public.employee_profiles (department_id);
CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON public.employee_profiles (employee_id);

CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.employee_profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.employee_profiles
  FOR EACH ROW EXECUTE FUNCTION update_profiles_updated_at();

ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.employee_profiles;
CREATE POLICY "Users can view own profile"
  ON public.employee_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert/update their own profile
DROP POLICY IF EXISTS "Users can upsert own profile" ON public.employee_profiles;
CREATE POLICY "Users can upsert own profile"
  ON public.employee_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.employee_profiles;
CREATE POLICY "Users can update own profile"
  ON public.employee_profiles FOR UPDATE
  USING (auth.uid() = user_id);
