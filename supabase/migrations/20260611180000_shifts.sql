-- Migration: Shift Management
-- Defines work shifts and allows assigning employees/departments to shifts

CREATE TABLE IF NOT EXISTS shifts (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  start_hour    SMALLINT NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
  start_minute  SMALLINT NOT NULL DEFAULT 0 CHECK (start_minute BETWEEN 0 AND 59),
  end_hour      SMALLINT NOT NULL CHECK (end_hour BETWEEN 0 AND 23),
  end_minute    SMALLINT NOT NULL DEFAULT 0 CHECK (end_minute BETWEEN 0 AND 59),
  late_grace_minutes SMALLINT NOT NULL DEFAULT 15 CHECK (late_grace_minutes BETWEEN 0 AND 120),
  color         TEXT NOT NULL DEFAULT '#8b7cff',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Employee shift assignments (an employee can be in one shift at a time)
CREATE TABLE IF NOT EXISTS employee_shifts (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_id      UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)  -- one active shift per employee
);

-- RLS
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_shifts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active shifts
DROP POLICY IF EXISTS "shifts_read" ON shifts;
CREATE POLICY "shifts_read" ON shifts
  FOR SELECT TO authenticated USING (is_active = true OR true);

-- Admin-only write
DROP POLICY IF EXISTS "shifts_admin_write" ON shifts;
CREATE POLICY "shifts_admin_write" ON shifts
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin','manager'))
  );

-- Employees can read their own assignment; admins can read all
DROP POLICY IF EXISTS "emp_shifts_read" ON employee_shifts;
CREATE POLICY "emp_shifts_read" ON employee_shifts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin','manager'))
  );

DROP POLICY IF EXISTS "emp_shifts_admin_write" ON employee_shifts;
CREATE POLICY "emp_shifts_admin_write" ON employee_shifts
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin','manager'))
  );

-- Seed default shifts
INSERT INTO shifts (name, start_hour, start_minute, end_hour, end_minute, late_grace_minutes, color)
VALUES
  ('Morning Shift',  9,  0, 18, 0, 15, '#8b7cff'),
  ('Evening Shift', 14,  0, 23, 0, 15, '#3ee8c7'),
  ('Night Shift',   22,  0,  6, 0, 15, '#ffb347')
ON CONFLICT DO NOTHING;
