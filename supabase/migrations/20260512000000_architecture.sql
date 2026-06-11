-- Migration: Clean architecture — roles, permissions, audit/activity/notification tables
-- Idempotent; safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Roles lookup ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roles (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  slug        TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  description TEXT        DEFAULT '',
  is_system   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.roles (slug, name, description, is_system) VALUES
  ('super_admin', 'Super Admin', 'Full system control including role/permission management', true),
  ('admin',       'Admin',       'Standard admin: users, locations, requests, audit',        true),
  ('manager',     'Manager',     'Approve requests and view team attendance',                 true),
  ('user',        'User',        'Standard employee — check-in/out and own data',            true)
ON CONFLICT (slug) DO NOTHING;

-- ─── Permissions (atomic capabilities) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permissions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  slug        TEXT        NOT NULL UNIQUE,
  resource    TEXT        NOT NULL,
  action      TEXT        NOT NULL,
  description TEXT        DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.permissions (slug, resource, action, description) VALUES
  ('attendance.check_in',        'attendance',        'check_in',    'Check in to start a session'),
  ('attendance.check_out',       'attendance',        'check_out',   'Check out to end a session'),
  ('attendance.view_own',        'attendance',        'view_own',    'View own attendance history'),
  ('attendance.view_all',        'attendance',        'view_all',    'View any user attendance'),
  ('locations.read',             'locations',         'read',        'View active locations'),
  ('locations.create',           'locations',         'create',      'Create new work locations'),
  ('locations.update',           'locations',         'update',      'Update existing locations'),
  ('locations.delete',           'locations',         'delete',      'Delete locations'),
  ('users.read',                 'users',             'read',        'List users'),
  ('users.update_role',          'users',             'update_role', 'Change a user role'),
  ('location_requests.create',   'location_requests', 'create',      'Submit a new location request'),
  ('location_requests.read_own', 'location_requests', 'read_own',    'View own location requests'),
  ('location_requests.read_all', 'location_requests', 'read_all',    'View all location requests'),
  ('location_requests.approve',  'location_requests', 'approve',     'Approve location requests'),
  ('location_requests.reject',   'location_requests', 'reject',      'Reject location requests'),
  ('audit_logs.view',            'audit_logs',        'view',        'View audit trail'),
  ('roles.manage',               'roles',             'manage',      'Manage roles and permissions'),
  ('location_access.grant',      'location_access',   'grant',       'Grant user access to a location'),
  ('location_access.revoke',     'location_access',   'revoke',      'Revoke user access to a location')
ON CONFLICT (slug) DO NOTHING;

-- ─── Role ↔ Permission (many-to-many) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id       UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- super_admin: everything
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'super_admin'
ON CONFLICT DO NOTHING;

-- admin: everything except roles.manage
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'admin' AND p.slug != 'roles.manage'
ON CONFLICT DO NOTHING;

-- manager: limited set
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'manager' AND p.slug IN (
  'attendance.view_own','attendance.view_all','attendance.check_in','attendance.check_out',
  'locations.read','locations.create','locations.update',
  'users.read',
  'location_requests.read_all','location_requests.approve','location_requests.reject',
  'audit_logs.view'
)
ON CONFLICT DO NOTHING;

-- user: own data only
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'user' AND p.slug IN (
  'attendance.check_in','attendance.check_out','attendance.view_own',
  'locations.read',
  'location_requests.create','location_requests.read_own'
)
ON CONFLICT DO NOTHING;

-- ─── Backfill role_id on user_roles ──────────────────────────────────────────

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.roles(id) ON DELETE RESTRICT;

UPDATE public.user_roles ur
SET role_id = r.id
FROM public.roles r
WHERE ur.role_id IS NULL AND ur.role = r.slug;

UPDATE public.user_roles ur
SET role_id = (SELECT id FROM public.roles WHERE slug = 'user')
WHERE ur.role_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON public.user_roles (role_id);

-- ─── Audit Logs ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id    UUID,
  actor_email TEXT,
  action      TEXT        NOT NULL,
  resource    TEXT        NOT NULL,
  resource_id TEXT,
  metadata    JSONB       DEFAULT '{}'::jsonb,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id   ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource   ON public.audit_logs (resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ─── Activity Logs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL,
  type        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  metadata    JSONB       DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id    ON public.activity_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type       ON public.activity_logs (type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs (created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_activity" ON public.activity_logs;
CREATE POLICY "users_read_own_activity"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ─── Notifications ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL,
  type        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  body        TEXT,
  link        TEXT,
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  metadata    JSONB       DEFAULT '{}'::jsonb,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON public.notifications (user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_notifications" ON public.notifications;
CREATE POLICY "users_read_own_notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ─── User Location Access ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_location_access (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL,
  location_id UUID        NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  granted_by  UUID,
  granted_at  TIMESTAMPTZ DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ,
  UNIQUE (user_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_user_location_access_user_id
  ON public.user_location_access (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_location_access_location_id
  ON public.user_location_access (location_id);

ALTER TABLE public.user_location_access ENABLE ROW LEVEL SECURITY;

-- ─── RLS on roles/permissions (read-only for authenticated) ──────────────────

ALTER TABLE public.roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
