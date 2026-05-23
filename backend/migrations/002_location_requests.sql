-- ============================================================
-- AttendTrack: Location Requests + User-Specific Locations
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Add is_global flag to locations
--    true  = visible to all users (admin-created global locations)
--    false = user-specific (visible only to assigned users)
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT true;

-- 2. Junction table: links a user to a user-specific location
CREATE TABLE IF NOT EXISTS user_locations (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id)  ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, location_id)
);

-- 3. Location requests: users ask admin to add a location for them
CREATE TABLE IF NOT EXISTS location_requests (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  address       TEXT NOT NULL DEFAULT '',
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 200,
  wifi_ssids    TEXT[] NOT NULL DEFAULT '{}',
  notes         TEXT,                         -- user's reason / description
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note    TEXT,                         -- admin's approval / rejection note
  reviewed_by   UUID REFERENCES auth.users(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_location_requests_user_id   ON location_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_location_requests_status    ON location_requests(status);
CREATE INDEX IF NOT EXISTS idx_location_requests_created   ON location_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_locations_user_id      ON user_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_location_id  ON user_locations(location_id);

-- 5. RLS
ALTER TABLE location_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_locations     ENABLE ROW LEVEL SECURITY;

-- Users can read their own requests
DROP POLICY IF EXISTS "users_read_own_requests" ON location_requests;
CREATE POLICY "users_read_own_requests"
  ON location_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can submit new requests
DROP POLICY IF EXISTS "users_insert_own_requests" ON location_requests;
CREATE POLICY "users_insert_own_requests"
  ON location_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can cancel their own PENDING requests
DROP POLICY IF EXISTS "users_delete_own_pending_requests" ON location_requests;
CREATE POLICY "users_delete_own_pending_requests"
  ON location_requests FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending');

-- Users can read their own user_locations (so they can pick them)
DROP POLICY IF EXISTS "users_read_own_user_locations" ON user_locations;
CREATE POLICY "users_read_own_user_locations"
  ON user_locations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role bypasses RLS automatically (backend uses service-role key)

-- ============================================================
-- NOTE: The locations table already has RLS with policy
-- "users_read_active_locations" which allows reading active locations.
-- For user-specific locations, filtering is done in the backend
-- service (using service-role key) which bypasses RLS.
-- ============================================================
