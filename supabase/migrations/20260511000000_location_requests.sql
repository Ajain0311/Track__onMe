-- Migration: User-specific locations and location requests
-- Idempotent; safe to re-run.

-- ─── is_global flag on locations ─────────────────────────────────────────────
-- (already present in base migration; guard with IF NOT EXISTS)
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT true;

-- ─── User Locations (junction table) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_locations (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id UUID        NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_user_locations_user_id     ON public.user_locations (user_id);
CREATE INDEX IF NOT EXISTS idx_user_locations_location_id ON public.user_locations (location_id);

ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_user_locations" ON public.user_locations;
CREATE POLICY "users_read_own_user_locations"
  ON public.user_locations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ─── Location Requests ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.location_requests (
  id            UUID             DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID             NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT             NOT NULL,
  address       TEXT             NOT NULL DEFAULT '',
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  accuracy      DOUBLE PRECISION,
  captured_at   TIMESTAMPTZ,
  radius_meters INTEGER          NOT NULL DEFAULT 200,
  wifi_ssids    TEXT[]           NOT NULL DEFAULT '{}',
  notes         TEXT,
  status        TEXT             NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note    TEXT,
  reviewed_by   UUID REFERENCES auth.users(id),
  reviewed_at   TIMESTAMPTZ,
  approved_by   UUID REFERENCES auth.users(id),
  approved_at   TIMESTAMPTZ,
  rejected_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ      DEFAULT NOW(),
  updated_at    TIMESTAMPTZ      DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_requests_user_id     ON public.location_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_location_requests_status      ON public.location_requests (status);
CREATE INDEX IF NOT EXISTS idx_location_requests_user_status ON public.location_requests (user_id, status);
CREATE INDEX IF NOT EXISTS idx_location_requests_created     ON public.location_requests (created_at DESC);

ALTER TABLE public.location_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_requests" ON public.location_requests;
CREATE POLICY "users_read_own_requests"
  ON public.location_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_requests" ON public.location_requests;
CREATE POLICY "users_insert_own_requests"
  ON public.location_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_pending_requests" ON public.location_requests;
CREATE POLICY "users_delete_own_pending_requests"
  ON public.location_requests FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending');

-- updated_at trigger
DO $$
BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS trg_set_updated_at ON public.location_requests';
  EXECUTE 'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.location_requests '||
          'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
END $$;
