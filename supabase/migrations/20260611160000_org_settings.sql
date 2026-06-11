-- Migration: Organization Settings (key-value config store)

CREATE TABLE IF NOT EXISTS org_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  label      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;

-- Admins can read and write
DROP POLICY IF EXISTS "org_settings_admin_all" ON org_settings;
CREATE POLICY "org_settings_admin_all" ON org_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- All authenticated users can read settings (needed for punctuality threshold etc.)
DROP POLICY IF EXISTS "org_settings_user_read" ON org_settings;
CREATE POLICY "org_settings_user_read" ON org_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Seed defaults
INSERT INTO org_settings (key, value, label) VALUES
  ('org_name',               'AttendTrack',    'Organization Name'),
  ('work_start_hour',        '9',              'Work Start Hour (0-23)'),
  ('work_start_minute',      '0',              'Work Start Minute (0-59)'),
  ('work_end_hour',          '18',             'Work End Hour (0-23)'),
  ('work_end_minute',        '0',              'Work End Minute (0-59)'),
  ('late_threshold_minutes', '15',             'Late Arrival Grace Period (minutes after work start)'),
  ('early_checkout_buffer',  '30',             'Early Checkout Buffer (minutes before work end)'),
  ('working_days',           '1,2,3,4,5',     'Working Weekdays (1=Mon … 7=Sun, comma-separated)'),
  ('timezone',               'Asia/Kolkata',   'Organization Timezone'),
  ('min_session_minutes',    '30',             'Minimum session length to count as present (minutes)')
ON CONFLICT (key) DO NOTHING;
