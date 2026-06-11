-- Migration: Expand user_roles.role check constraint to include manager and super_admin

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('super_admin', 'admin', 'manager', 'user'));
