-- Migration: Base schema — user_roles and locations
-- Idempotent; safe to re-run on an existing database.

-- ─── User Roles ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_roles (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'user'
              CHECK (role IN ('super_admin', 'admin', 'manager', 'user')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users can read their own role
DROP POLICY IF EXISTS "users_read_own_role" ON public.user_roles;
CREATE POLICY "users_read_own_role"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ─── Locations ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.locations (
  id             UUID              DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT              NOT NULL,
  address        TEXT              NOT NULL DEFAULT '',
  latitude       DOUBLE PRECISION  NOT NULL,
  longitude      DOUBLE PRECISION  NOT NULL,
  radius_meters  INTEGER           NOT NULL DEFAULT 200,
  wifi_ssids     TEXT[]            NOT NULL DEFAULT '{}',
  is_active      BOOLEAN           NOT NULL DEFAULT true,
  is_global      BOOLEAN           NOT NULL DEFAULT true,
  created_by     UUID,
  created_at     TIMESTAMPTZ       DEFAULT NOW(),
  updated_at     TIMESTAMPTZ       DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_locations_is_active ON public.locations (is_active);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_active_locations" ON public.locations;
CREATE POLICY "users_read_active_locations"
  ON public.locations FOR SELECT TO authenticated
  USING (is_active = true);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_roles', 'locations']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I '||
      'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;
