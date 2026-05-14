-- ============================================================
-- AttendTrack: Admin + Locations migration
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. User roles (admin / user)
CREATE TABLE IF NOT EXISTS user_roles (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL UNIQUE,
  role        TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Office / work locations
CREATE TABLE IF NOT EXISTS locations (
  id             UUID              DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT              NOT NULL,
  address        TEXT              NOT NULL DEFAULT '',
  latitude       DOUBLE PRECISION  NOT NULL,
  longitude      DOUBLE PRECISION  NOT NULL,
  radius_meters  INTEGER           NOT NULL DEFAULT 200,
  wifi_ssids     TEXT[]            NOT NULL DEFAULT '{}',
  is_active      BOOLEAN           NOT NULL DEFAULT true,
  created_by     UUID,
  created_at     TIMESTAMPTZ       DEFAULT NOW(),
  updated_at     TIMESTAMPTZ       DEFAULT NOW()
);

-- 3. Extend attendance with location tracking
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS location_id    UUID REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_name  TEXT;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id   ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_is_active   ON locations(is_active);
CREATE INDEX IF NOT EXISTS idx_attendance_location_id ON attendance(location_id);

-- 5. RLS: service-role key bypasses RLS so backend works fine.
--    Enable RLS on both tables so direct frontend reads are blocked.
ALTER TABLE user_roles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations   ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read active locations
CREATE POLICY "users_read_active_locations"
  ON locations FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Allow service role full access (backend)
-- (service role bypasses RLS automatically, no policy needed)

-- ============================================================
-- HOW TO MAKE YOUR FIRST ADMIN:
--   Replace <YOUR_USER_ID> with the UUID from auth.users
--
--   INSERT INTO user_roles (user_id, role)
--   VALUES ('<YOUR_USER_ID>', 'admin')
--   ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
-- ============================================================
