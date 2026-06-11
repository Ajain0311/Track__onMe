-- Migration: Admin RLS policies
-- Adds SELECT/UPDATE policies so admins and managers can operate on
-- leaves, attendance_corrections, and employee_profiles via the Supabase client.
-- Backend uses service_role key (bypasses RLS) but these policies are needed
-- for direct Supabase client queries from admin/manager sessions.

-- ─── Leaves: admin/manager view and status updates ───────────────────────────

DROP POLICY IF EXISTS "Admins can view all leaves" ON public.leaves;
CREATE POLICY "Admins can view all leaves"
  ON public.leaves FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Admins can update any leave" ON public.leaves;
CREATE POLICY "Admins can update any leave"
  ON public.leaves FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'manager')
    )
  );

-- ─── Attendance Corrections: admin/manager view and status updates ────────────

DROP POLICY IF EXISTS "Admins can view all corrections" ON public.attendance_corrections;
CREATE POLICY "Admins can view all corrections"
  ON public.attendance_corrections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Admins can update any correction" ON public.attendance_corrections;
CREATE POLICY "Admins can update any correction"
  ON public.attendance_corrections FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'manager')
    )
  );

-- ─── Employee Profiles: admin/manager view all ───────────────────────────────

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.employee_profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.employee_profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Admins can update any profile" ON public.employee_profiles;
CREATE POLICY "Admins can update any profile"
  ON public.employee_profiles FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'manager')
    )
  );

-- ─── Departments: admin write ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage departments" ON public.departments;
CREATE POLICY "Admins can manage departments"
  ON public.departments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'manager')
    )
  );

-- ─── Attendance: admin/manager can view all sessions ─────────────────────────

DROP POLICY IF EXISTS "Admins can view all attendance" ON public.attendance;
CREATE POLICY "Admins can view all attendance"
  ON public.attendance FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Admins can update attendance" ON public.attendance;
CREATE POLICY "Admins can update attendance"
  ON public.attendance FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin', 'manager')
    )
  );
