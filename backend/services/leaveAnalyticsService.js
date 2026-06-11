// services/leaveAnalyticsService.js — Leave pattern analytics for HR/Admin

const { supabase } = require('./supabase');

const pad2 = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const getLeaveAnalytics = async ({ year } = {}) => {
  const now   = new Date();
  const y     = year || now.getFullYear();

  const [leavesRes, typesRes, usersRes, profilesRes] = await Promise.all([
    supabase
      .from('leaves')
      .select('id, user_id, leave_type_id, start_date, end_date, days, status, created_at, leave_types(id, name, color, is_paid)')
      .gte('start_date', `${y}-01-01`)
      .lte('start_date', `${y}-12-31`)
      .order('start_date', { ascending: true }),
    supabase.from('leave_types').select('id, name, color, is_paid, annual_days').eq('is_active', true),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from('employee_profiles').select('user_id, department_id, departments(id, name, color)'),
  ]);

  if (leavesRes.error) throw new Error(leavesRes.error.message);

  const leaves   = leavesRes.data || [];
  const types    = typesRes.data || [];
  const allUsers = usersRes.data?.users || [];
  const profiles = profilesRes.data || [];

  const profileMap = Object.fromEntries(profiles.map((p) => [p.user_id, p]));
  const totalUsers = allUsers.length || 1;

  // ── Monthly trend ────────────────────────────────────────────────────────
  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
    month:    MONTHS[i],
    monthIdx: i,
    approved: 0,
    pending:  0,
    rejected: 0,
    days:     0,
  }));

  for (const l of leaves) {
    const m = parseInt(l.start_date.slice(5, 7), 10) - 1;
    if (m < 0 || m > 11) continue;
    monthlyData[m][l.status] = (monthlyData[m][l.status] || 0) + 1;
    if (l.status === 'approved') monthlyData[m].days += l.days || 0;
  }

  // Cap to current month if current year
  const cutoff = y === now.getFullYear() ? now.getMonth() : 11;
  const monthlyTrend = monthlyData.slice(0, cutoff + 1);

  // ── Leave type breakdown ─────────────────────────────────────────────────
  const typeMap = {};
  for (const t of types) {
    typeMap[t.id] = { id: t.id, name: t.name, color: t.color, isPaid: t.is_paid, count: 0, days: 0, approved: 0, rejected: 0, pending: 0 };
  }
  for (const l of leaves) {
    if (!typeMap[l.leave_type_id]) continue;
    typeMap[l.leave_type_id].count++;
    typeMap[l.leave_type_id].days += l.days || 0;
    typeMap[l.leave_type_id][l.status] = (typeMap[l.leave_type_id][l.status] || 0) + 1;
  }
  const typeBreakdown = Object.values(typeMap)
    .filter((t) => t.count > 0)
    .sort((a, b) => b.days - a.days);

  // ── Department breakdown ──────────────────────────────────────────────────
  const deptMap = {};
  for (const l of leaves) {
    const profile = profileMap[l.user_id];
    if (!profile?.departments) continue;
    const { id, name, color } = profile.departments;
    if (!deptMap[id]) deptMap[id] = { id, name, color, count: 0, days: 0, uniqueEmployees: new Set() };
    deptMap[id].count++;
    deptMap[id].days += l.days || 0;
    deptMap[id].uniqueEmployees.add(l.user_id);
  }
  const deptBreakdown = Object.values(deptMap)
    .map((d) => ({ ...d, uniqueEmployees: d.uniqueEmployees.size }))
    .sort((a, b) => b.days - a.days);

  // ── Overall summary ──────────────────────────────────────────────────────
  const approved = leaves.filter((l) => l.status === 'approved');
  const pending  = leaves.filter((l) => l.status === 'pending');
  const rejected = leaves.filter((l) => l.status === 'rejected');
  const totalDays = approved.reduce((s, l) => s + (l.days || 0), 0);
  const approvalRate = leaves.length > 0
    ? Math.round(((approved.length) / (approved.length + rejected.length || 1)) * 100)
    : 0;
  const avgDuration = approved.length > 0
    ? Math.round((totalDays / approved.length) * 10) / 10
    : 0;

  // ── Peak leave month ────────────────────────────────────────────────────
  const peakMonth = monthlyTrend.reduce(
    (best, m) => (m.approved > (best?.approved || 0) ? m : best),
    null
  );

  // ── Top leave takers ────────────────────────────────────────────────────
  const userDays = {};
  for (const l of approved) {
    if (!userDays[l.user_id]) userDays[l.user_id] = { days: 0, count: 0 };
    userDays[l.user_id].days  += l.days || 0;
    userDays[l.user_id].count += 1;
  }
  const emailMap = Object.fromEntries(allUsers.map((u) => [u.id, u.email]));
  const profileNameMap = Object.fromEntries(profiles.map((p) => [p.user_id, null]));
  const topLeaveTakers = Object.entries(userDays)
    .map(([uid, v]) => ({ userId: uid, email: emailMap[uid] || uid, ...v }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 7);

  return {
    summary: {
      total:        leaves.length,
      approved:     approved.length,
      pending:      pending.length,
      rejected:     rejected.length,
      totalDays,
      approvalRate,
      avgDuration,
      peakMonth:    peakMonth?.month || null,
      year:         y,
    },
    monthlyTrend,
    typeBreakdown,
    deptBreakdown,
    topLeaveTakers,
  };
};

module.exports = { getLeaveAnalytics };
