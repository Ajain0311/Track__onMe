-- ============================================================
-- AttendTrack: Clean architecture migration (003)
-- Adds: roles, permissions, role_permissions, audit_logs,
--       activity_logs, notifications, user_location_access.
-- Keeps: existing data in attendance, user_roles, locations,
--        location_requests (backward-compatible additions only).
-- Run order: idempotent — safe to re-run.
-- ============================================================

-- ─── EXTENSIONS ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. ROLES (lookup table; replaces hardcoded text 'admin'|'user') ───────
CREATE TABLE IF NOT EXISTS roles (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  slug        TEXT        NOT NULL UNIQUE,        -- super_admin, admin, manager, user
  name        TEXT        NOT NULL,
  description TEXT        DEFAULT '',
  is_system   BOOLEAN     NOT NULL DEFAULT false, -- protected from deletion
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO roles (slug, name, description, is_system) VALUES
  ('super_admin', 'Super Admin', 'Full system control including role/permission management', true),
  ('admin',       'Admin',       'Standard admin: users, locations, requests, audit',          true),
  ('manager',     'Manager',     'Approve location requests and view team attendance',        true),
  ('user',        'User',        'Standard employee — check-in/out and own data',             true)
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. PERMISSIONS (atomic capabilities) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  slug        TEXT        NOT NULL UNIQUE,
  resource    TEXT        NOT NULL,
  action      TEXT        NOT NULL,
  description TEXT        DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO permissions (slug, resource, action, description) VALUES
  ('attendance.check_in',           'attendance',        'check_in',      'Check in to start a session'),
  ('attendance.check_out',          'attendance',        'check_out',     'Check out to end a session'),
  ('attendance.view_own',           'attendance',        'view_own',      'View own attendance history'),
  ('attendance.view_all',           'attendance',        'view_all',      'View any user attendance'),
  ('locations.read',                'locations',         'read',          'View active locations'),
  ('locations.create',              'locations',         'create',        'Create new work locations'),
  ('locations.update',              'locations',         'update',        'Update existing locations'),
  ('locations.delete',              'locations',         'delete',        'Delete locations'),
  ('users.read',                    'users',             'read',          'List users'),
  ('users.update_role',             'users',             'update_role',   'Change a user role'),
  ('location_requests.create',      'location_requests', 'create',        'Submit a new location request'),
  ('location_requests.read_own',    'location_requests', 'read_own',      'View own location requests'),
  ('location_requests.read_all',    'location_requests', 'read_all',      'View all location requests'),
  ('location_requests.approve',     'location_requests', 'approve',       'Approve location requests'),
  ('location_requests.reject',      'location_requests', 'reject',        'Reject location requests'),
  ('audit_logs.view',               'audit_logs',        'view',          'View audit trail'),
  ('roles.manage',                  'roles',             'manage',        'Manage roles and permissions'),
  ('location_access.grant',         'location_access',   'grant',         'Grant a user access to a location'),
  ('location_access.revoke',        'location_access',   'revoke',        'Revoke user access to a location')
ON CONFLICT (slug) DO NOTHING;

-- ─── 3. ROLE_PERMISSIONS (many-to-many) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- Seed: super_admin gets everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'super_admin'
ON CONFLICT DO NOTHING;

-- admin: everything except role/permission management
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'admin' AND p.slug != 'roles.manage'
ON CONFLICT DO NOTHING;

-- manager: read users, locations CRUD, approve/reject requests, audit view
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'manager' AND p.slug IN (
  'attendance.view_own','attendance.view_all','attendance.check_in','attendance.check_out',
  'locations.read','locations.create','locations.update',
  'users.read',
  'location_requests.read_all','location_requests.approve','location_requests.reject',
  'audit_logs.view'
)
ON CONFLICT DO NOTHING;

-- user: own data + check-in/out + request locations
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'user' AND p.slug IN (
  'attendance.check_in','attendance.check_out','attendance.view_own',
  'locations.read',
  'location_requests.create','location_requests.read_own'
)
ON CONFLICT DO NOTHING;

-- ─── 4. USER_ROLES: add role_id FK (keep text 'role' column for backward compat) ──
ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id) ON DELETE RESTRICT;

-- Backfill role_id from existing text role
UPDATE user_roles ur
SET role_id = r.id
FROM roles r
WHERE ur.role_id IS NULL AND ur.role = r.slug;

-- For any rows still null (orphaned), default to 'user' role
UPDATE user_roles ur
SET role_id = (SELECT id FROM roles WHERE slug = 'user')
WHERE ur.role_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- ─── 5. AUDIT_LOGS (admin/sensitive action trail) ──────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id    UUID,                       -- nullable so system actions can be logged
  actor_email TEXT,
  action      TEXT         NOT NULL,      -- e.g. 'location.create', 'role.update'
  resource    TEXT         NOT NULL,      -- e.g. 'locations', 'users'
  resource_id TEXT,                       -- ID of the affected row (text to support any FK type)
  metadata    JSONB        DEFAULT '{}'::jsonb,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id    ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource    ON audit_logs(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON audit_logs(created_at DESC);

-- ─── 6. ACTIVITY_LOGS (user-facing activity feed) ──────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID         NOT NULL,
  type        TEXT         NOT NULL,      -- 'check_in','check_out','location_request','login',...
  title       TEXT         NOT NULL,
  description TEXT,
  metadata    JSONB        DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id    ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type       ON activity_logs(type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- ─── 7. NOTIFICATIONS (per-user inbox) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID         NOT NULL,
  type        TEXT         NOT NULL,      -- 'location_request_approved', etc.
  title       TEXT         NOT NULL,
  body        TEXT,
  link        TEXT,                       -- optional in-app deep link
  is_read     BOOLEAN      NOT NULL DEFAULT false,
  metadata    JSONB        DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  read_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id  ON notifications(user_id, is_read, created_at DESC);

-- ─── 8. USER_LOCATION_ACCESS (which users can use which locations) ─────────
CREATE TABLE IF NOT EXISTS user_location_access (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        NOT NULL,
  location_id  UUID        NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  granted_by   UUID,                    -- admin who granted
  granted_at   TIMESTAMPTZ DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ,             -- soft-revoke for audit trail
  UNIQUE (user_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_user_location_access_user_id     ON user_location_access(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_location_access_location_id ON user_location_access(location_id);

-- ─── 9. LOCATION_REQUESTS enhancements ─────────────────────────────────────
ALTER TABLE location_requests
  ADD COLUMN IF NOT EXISTS accuracy        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS captured_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS address         TEXT,
  ADD COLUMN IF NOT EXISTS approved_by     UUID,
  ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_location_requests_user_status
  ON location_requests(user_id, status);

-- ─── 10. AUTO-UPDATE updated_at TRIGGERS ───────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles','user_roles','locations','location_requests']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I '||
      'FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- ─── 11. ROW-LEVEL SECURITY ────────────────────────────────────────────────
ALTER TABLE roles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_location_access ENABLE ROW LEVEL SECURITY;

-- All admin queries go through backend with service_role key (bypasses RLS).
-- Direct frontend reads are denied except notifications/activity_logs for self.
DROP POLICY IF EXISTS "users_read_own_notifications" ON notifications;
CREATE POLICY "users_read_own_notifications" ON notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_read_own_activity" ON activity_logs;
CREATE POLICY "users_read_own_activity" ON activity_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ─── DONE ──────────────────────────────────────────────────────────────────
SELECT 'Migration 003 complete' AS status;
