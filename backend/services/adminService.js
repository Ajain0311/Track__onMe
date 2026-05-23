// services/adminService.js
// Admin-level DB operations: users, roles, dashboard stats.

const { supabase } = require('./supabase');

// ─── Role helpers ─────────────────────────────────────────────────────────────

const getUserRole = async (userId) => {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.role || 'user';
};

const setUserRole = async (userId, role) => {
  const { data, error } = await supabase
    .from('user_roles')
    .upsert(
      { user_id: userId, role, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};

// ─── Users list ───────────────────────────────────────────────────────────────

const getAllUsers = async ({ page = 1, perPage = 50 } = {}) => {
  // List users via admin API (service-role only)
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers({
    page,
    perPage,
  });
  if (usersError) throw new Error(usersError.message);

  // Fetch all roles at once
  const { data: roles } = await supabase.from('user_roles').select('user_id, role');
  const rolesMap = Object.fromEntries((roles || []).map((r) => [r.user_id, r.role]));

  // Aggregate attendance stats per user
  const { data: stats, error: statsError } = await supabase
    .from('attendance')
    .select('user_id, total_duration, check_in_time, check_out_time, date');
  if (statsError) throw new Error(statsError.message);

  const statsMap = {};
  const todayStr = new Date().toISOString().split('T')[0];

  for (const s of stats || []) {
    if (!statsMap[s.user_id]) {
      statsMap[s.user_id] = {
        totalMinutes: 0,
        sessionCount: 0,
        lastSeen: null,
        checkedInToday: false,
      };
    }
    const m = statsMap[s.user_id];
    if (s.check_out_time && typeof s.total_duration === 'number') {
      m.totalMinutes += s.total_duration;
      m.sessionCount += 1;
    }
    if (!s.check_out_time) {
      // active right now
      m.isActiveNow = true;
    }
    if (s.date === todayStr) m.checkedInToday = true;
    if (!m.lastSeen || s.check_in_time > m.lastSeen) m.lastSeen = s.check_in_time;
  }

  return users.map((u) => {
    const s = statsMap[u.id] || {};
    return {
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at,
      role: rolesMap[u.id] || 'user',
      isActiveNow: s.isActiveNow || false,
      checkedInToday: s.checkedInToday || false,
      totalMinutes: s.totalMinutes || 0,
      sessionCount: s.sessionCount || 0,
      lastSeen: s.lastSeen || null,
    };
  });
};

// ─── Single user attendance ───────────────────────────────────────────────────

const getUserAttendanceAdmin = async (userId) => {
  const { data, error } = await supabase
    .from('attendance')
    .select('*, locations(name, address)')
    .eq('user_id', userId)
    .order('check_in_time', { ascending: false });
  if (error) throw new Error(error.message);

  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    totalDuration: row.total_duration,
    date: row.date,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    checkInMethod: row.check_in_method ?? null,
    locationId: row.location_id ?? null,
    locationName: row.location_name || row.locations?.name || null,
    locationAddress: row.locations?.address || null,
  }));
};

// ─── Dashboard stats ──────────────────────────────────────────────────────────

const getDashboardStats = async () => {
  const today = new Date().toISOString().split('T')[0];

  const [usersRes, activeRes, todayRes, locRes] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1 }),
    supabase.from('attendance').select('user_id', { count: 'exact', head: true }).is('check_out_time', null),
    supabase.from('attendance').select('user_id', { count: 'exact', head: true }).eq('date', today),
    supabase.from('locations').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  // total users: use the total from the first page response
  const totalUsers = usersRes.data?.total || usersRes.data?.users?.length || 0;

  return {
    totalUsers,
    activeNow: activeRes.count || 0,
    checkedInToday: todayRes.count || 0,
    activeLocations: locRes.count || 0,
  };
};

// ─── Live attendance (admin) ──────────────────────────────────────────────────
// Currently-active sessions joined with user emails. Used by the admin live view.

const getActiveSessions = async () => {
  const { data: rows, error } = await supabase
    .from('attendance')
    .select('id, user_id, check_in_time, location_id, location_name, check_in_method, latitude, longitude')
    .is('check_out_time', null)
    .order('check_in_time', { ascending: false });
  if (error) throw new Error(error.message);
  if (!rows?.length) return [];

  // Resolve emails in one batch via the auth admin listUsers (cap perPage at 200)
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const emailMap = Object.fromEntries((users || []).map((u) => [u.id, u.email]));

  const now = Date.now();
  return rows.map((r) => ({
    id:           r.id,
    userId:       r.user_id,
    userEmail:    emailMap[r.user_id] || null,
    checkInTime:  r.check_in_time,
    elapsedMin:   Math.max(0, Math.round((now - new Date(r.check_in_time).getTime()) / 60000)),
    locationId:   r.location_id || null,
    locationName: r.location_name || null,
    method:       r.check_in_method || null,
    latitude:     r.latitude ?? null,
    longitude:    r.longitude ?? null,
  }));
};

module.exports = {
  getUserRole,
  setUserRole,
  getAllUsers,
  getUserAttendanceAdmin,
  getDashboardStats,
  getActiveSessions,
};
