-- Migration: Holiday Calendar
-- Holidays are excluded from attendance workday counts

CREATE TABLE IF NOT EXISTS holidays (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date       DATE NOT NULL,
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  type       TEXT NOT NULL DEFAULT 'public' CHECK (type IN ('public', 'optional', 'org')),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (date)
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active holidays
DROP POLICY IF EXISTS "holidays_read_authenticated" ON holidays;
CREATE POLICY "holidays_read_authenticated" ON holidays
  FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = true);

-- Only admins can insert / update / delete
DROP POLICY IF EXISTS "holidays_admin_write" ON holidays;
CREATE POLICY "holidays_admin_write" ON holidays
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Seed with Indian national holidays for 2026
INSERT INTO holidays (date, name, type) VALUES
  ('2026-01-26', 'Republic Day',               'public'),
  ('2026-03-25', 'Holi',                        'public'),
  ('2026-04-02', 'Ram Navami',                  'public'),
  ('2026-04-03', 'Good Friday',                 'public'),
  ('2026-04-14', 'Ambedkar Jayanti / Vishu',    'public'),
  ('2026-05-24', 'Buddha Purnima',              'public'),
  ('2026-07-06', 'Eid al-Adha',                 'public'),
  ('2026-08-15', 'Independence Day',            'public'),
  ('2026-08-19', 'Muharram',                    'public'),
  ('2026-08-23', 'Onam',                        'public'),
  ('2026-09-05', 'Janmashtami',                 'public'),
  ('2026-10-02', 'Gandhi Jayanti',              'public'),
  ('2026-10-12', 'Dussehra',                    'public'),
  ('2026-10-20', 'Diwali (Lakshmi Puja)',       'public'),
  ('2026-11-04', 'Guru Nanak Jayanti',          'public'),
  ('2026-11-25', 'Christmas Day',               'public'),
  ('2026-12-25', 'Christmas Day',               'public')
ON CONFLICT (date) DO NOTHING;
