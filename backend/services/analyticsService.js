// services/analyticsService.js — Personal + org-wide workforce analytics

const { supabase } = require('./supabase');

const pad2 = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// ── Helpers ────────────────────────────────────────────────────────────────

const isWeekday = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  return dow !== 0 && dow !== 6;
};

const buildDateRange = (startDate, endDate) => {
  const dates = [];
  const cur = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (cur <= end) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};

const monthBounds = (year, month) => {
  const first = `${year}-${pad2(month + 1)}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const last = `${year}-${pad2(month + 1)}-${pad2(lastDay)}`;
  return { first, last };
};

// ── Personal Analytics ──────────────────────────────────────────────────────

const getPersonalAnalytics = async (userId) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // This month bounds
  const { first: mFirst, last: mLast } = monthBounds(year, month);

  // Last month bounds
  const lastMonthDate = new Date(year, month - 1, 1);
  const { first: lmFirst, last: lmLast } = monthBounds(
    lastMonthDate.getFullYear(), lastMonthDate.getMonth()
  );

  // Fetch all attendance for this year (cap at 500 for performance)
  const { data: sessions, error } = await supabase
    .from('attendance')
    .select('id, check_in_time, check_out_time, total_duration, date, location_name')
    .eq('user_id', userId)
    .gte('check_in_time', `${year}-01-01T00:00:00`)
    .order('check_in_time', { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  // Build set of present days
  const presentDays = new Set(
    (sessions || []).map((s) => (s.date || s.check_in_time?.split('T')[0] || ''))
  );

  const todayStr = toDateStr(now);

  // Helper: compute rate for a date range
  const computeRate = (first, last) => {
    const capDate = todayStr < last ? todayStr : last;
    const dates = buildDateRange(first, capDate);
    const workdays = dates.filter(isWeekday);
    if (workdays.length === 0) return { present: 0, workdays: 0, rate: null };
    const present = workdays.filter((d) => presentDays.has(d)).length;
    return { present, workdays: workdays.length, rate: Math.round((present / workdays.length) * 100) };
  };

  const thisMonth = computeRate(mFirst, mLast);
  const lastMonth = computeRate(lmFirst, lmLast);

  // Last 30 days daily data (for trend chart)
  const trendDates = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = toDateStr(d);
    const sessionsOnDay = (sessions || []).filter((s) =>
      (s.date || s.check_in_time?.split('T')[0]) === ds
    );
    const totalSecs = sessionsOnDay.reduce((sum, s) => sum + (s.total_duration || 0), 0);
    trendDates.push({
      date: ds,
      present: presentDays.has(ds),
      totalSecs,
      totalHours: Math.round(totalSecs / 3600 * 10) / 10,
      isWeekend: !isWeekday(ds),
      isFuture: ds > todayStr,
    });
  }

  // All-time stats
  const completedSessions = (sessions || []).filter((s) => s.check_out_time);
  const totalSecs = completedSessions.reduce((sum, s) => sum + (s.total_duration || 0), 0);
  const avgSecsPerDay = presentDays.size > 0 ? totalSecs / presentDays.size : 0;

  // Year stats
  const yearDates = buildDateRange(`${year}-01-01`, todayStr);
  const yearWorkdays = yearDates.filter(isWeekday);
  const yearPresent = yearWorkdays.filter((d) => presentDays.has(d)).length;

  return {
    thisMonth,
    lastMonth,
    trendDates,
    allTime: {
      totalSessions: sessions?.length || 0,
      presentDays: presentDays.size,
      totalHours: Math.round(totalSecs / 3600 * 10) / 10,
      avgHoursPerDay: Math.round(avgSecsPerDay / 3600 * 10) / 10,
    },
    year: {
      present: yearPresent,
      workdays: yearWorkdays.length,
      rate: yearWorkdays.length > 0 ? Math.round((yearPresent / yearWorkdays.length) * 100) : null,
    },
  };
};

// ── Org Analytics ──────────────────────────────────────────────────────────

const getOrgAnalytics = async (days = 30) => {
  const now = new Date();
  const todayStr = toDateStr(now);
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (days - 1));
  const startStr = toDateStr(startDate);

  // Fetch recent attendance
  const [attendanceRes, usersRes, deptRes] = await Promise.all([
    supabase
      .from('attendance')
      .select('user_id, check_in_time, total_duration, date')
      .gte('check_in_time', `${startStr}T00:00:00`)
      .order('check_in_time', { ascending: false }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase
      .from('employee_profiles')
      .select('user_id, department_id, departments(id, name, color)'),
  ]);

  if (attendanceRes.error) throw new Error(attendanceRes.error.message);

  const totalUsers = (usersRes.data?.users || []).length || 1;
  const sessions = attendanceRes.data || [];
  const profiles = deptRes.data || [];

  // Daily attendance rates
  const dateRange = buildDateRange(startStr, todayStr);
  const dailyMap = {};
  for (const s of sessions) {
    const d = s.date || s.check_in_time?.split('T')[0];
    if (!d) continue;
    if (!dailyMap[d]) dailyMap[d] = new Set();
    dailyMap[d].add(s.user_id);
  }

  const dailyRates = dateRange.map((d) => ({
    date: d,
    present: dailyMap[d]?.size || 0,
    total: totalUsers,
    rate: Math.round(((dailyMap[d]?.size || 0) / totalUsers) * 100),
    isWeekend: !isWeekday(d),
  }));

  // Department breakdown for today (and this week)
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartStr = toDateStr(weekStart);
  const weekSessions = sessions.filter((s) => {
    const d = s.date || s.check_in_time?.split('T')[0];
    return d >= weekStartStr && d <= todayStr;
  });

  const deptMap = {};
  for (const p of profiles) {
    if (!p.department_id || !p.departments) continue;
    if (!deptMap[p.department_id]) {
      deptMap[p.department_id] = {
        id:    p.department_id,
        name:  p.departments.name,
        color: p.departments.color,
        members: new Set(),
        presentThisWeek: new Set(),
      };
    }
    deptMap[p.department_id].members.add(p.user_id);
  }
  for (const s of weekSessions) {
    const profile = profiles.find((p) => p.user_id === s.user_id);
    if (profile?.department_id && deptMap[profile.department_id]) {
      deptMap[profile.department_id].presentThisWeek.add(s.user_id);
    }
  }

  const deptBreakdown = Object.values(deptMap)
    .map((d) => ({
      id:       d.id,
      name:     d.name,
      color:    d.color,
      total:    d.members.size,
      present:  d.presentThisWeek.size,
      rate:     d.members.size > 0 ? Math.round((d.presentThisWeek.size / d.members.size) * 100) : 0,
    }))
    .sort((a, b) => b.rate - a.rate);

  // Top 7 days by presence (for insights)
  const todayStats = dailyRates.find((d) => d.date === todayStr) || { present: 0, rate: 0 };
  const weekdays  = dailyRates.filter((d) => !d.isWeekend);
  const avgRate   = weekdays.length > 0
    ? Math.round(weekdays.reduce((s, d) => s + d.rate, 0) / weekdays.length)
    : 0;

  // User-level summary for top performers (last 30 days)
  const userDays = {};
  for (const s of sessions) {
    const d = s.date || s.check_in_time?.split('T')[0];
    if (!d || !isWeekday(d)) continue;
    if (!userDays[s.user_id]) userDays[s.user_id] = { days: new Set(), totalSecs: 0 };
    userDays[s.user_id].days.add(d);
    userDays[s.user_id].totalSecs += s.total_duration || 0;
  }

  const emailMap = Object.fromEntries(
    (usersRes.data?.users || []).map((u) => [u.id, u.email])
  );

  const workdaysInPeriod = dateRange.filter(isWeekday).length;
  const topPerformers = Object.entries(userDays)
    .map(([uid, v]) => ({
      userId:    uid,
      email:     emailMap[uid] || uid,
      days:      v.days.size,
      totalHrs:  Math.round(v.totalSecs / 3600 * 10) / 10,
      rate:      workdaysInPeriod > 0 ? Math.round((v.days.size / workdaysInPeriod) * 100) : 0,
    }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);

  return {
    dailyRates,
    deptBreakdown,
    topPerformers,
    summary: {
      todayPresent: todayStats.present,
      todayRate:    todayStats.rate,
      avgRate,
      totalUsers,
      period: days,
    },
  };
};

module.exports = { getPersonalAnalytics, getOrgAnalytics };
