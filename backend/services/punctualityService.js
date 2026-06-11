// services/punctualityService.js — Late arrival & punctuality analytics

const { supabase } = require('./supabase');
const { getHolidaysForYear, buildHolidaySet } = require('./holidayService');
const { getPunctualityConfig } = require('./orgSettingsService');

const pad2 = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const isWeekday = (ds) => { const dow = new Date(ds + 'T00:00:00').getDay(); return dow !== 0 && dow !== 6; };

// ── Helpers ────────────────────────────────────────────────────────────────────

const getLocalHour = (isoStr) => new Date(isoStr).getHours();
const getLocalMin  = (isoStr) => new Date(isoStr).getMinutes();

const makeIsLate = (cfg) => (checkInIso) => {
  const h = getLocalHour(checkInIso), m = getLocalMin(checkInIso);
  return h > cfg.lateHour || (h === cfg.lateHour && m > cfg.lateMin);
};

const makeMinsLate = (cfg) => (checkInIso) => {
  const h = getLocalHour(checkInIso), m = getLocalMin(checkInIso);
  const totalMin = h * 60 + m;
  const threshold = cfg.lateHour * 60 + cfg.lateMin;
  return Math.max(0, totalMin - threshold);
};

const makeIsEarlyCheckout = (cfg) => (checkOutIso) => {
  if (!checkOutIso) return false;
  return getLocalHour(checkOutIso) < cfg.earlyCheckoutHour;
};

// ── Personal Punctuality ────────────────────────────────────────────────────────

const getPersonalPunctuality = async (userId, months = 3) => {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() - months);
  const startStr = toDateStr(startDate);

  const [sessionRes, cfg] = await Promise.all([
    supabase
      .from('attendance')
      .select('check_in_time, check_out_time, total_duration, date')
      .eq('user_id', userId)
      .gte('check_in_time', `${startStr}T00:00:00`)
      .order('check_in_time', { ascending: false }),
    getPunctualityConfig(),
  ]);

  if (sessionRes.error) throw new Error(sessionRes.error.message);

  const isLate           = makeIsLate(cfg);
  const minsLate         = makeMinsLate(cfg);
  const isEarlyCheckout  = makeIsEarlyCheckout(cfg);

  const s = sessionRes.data || [];
  let lateCount = 0, onTimeCount = 0, earlyCheckoutCount = 0;
  let totalLateMinutes = 0;
  const lateDays = [];

  for (const sess of s) {
    if (!sess.check_in_time) continue;
    if (isLate(sess.check_in_time)) {
      lateCount++;
      const mins = minsLate(sess.check_in_time);
      totalLateMinutes += mins;
      lateDays.push({
        date:      sess.date || sess.check_in_time.split('T')[0],
        checkIn:   sess.check_in_time,
        minsLate:  mins,
      });
    } else {
      onTimeCount++;
    }
    if (isEarlyCheckout(sess.check_out_time)) {
      earlyCheckoutCount++;
    }
  }

  const total = s.length;
  const punctualityRate = total > 0 ? Math.round((onTimeCount / total) * 100) : null;
  const avgLateMinutes  = lateCount > 0 ? Math.round(totalLateMinutes / lateCount) : 0;
  const lateThreshold   = `${pad2(cfg.lateHour)}:${pad2(cfg.lateMin)}`;

  return {
    punctualityRate, onTimeCount, lateCount,
    earlyCheckoutCount, avgLateMinutes,
    totalSessions: total, recentLate: lateDays.slice(0, 5), lateThreshold,
  };
};

// ── Org Punctuality ────────────────────────────────────────────────────────────

const getOrgPunctuality = async (days = 30) => {
  const now = new Date();
  const todayStr = toDateStr(now);
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (days - 1));
  const startStr = toDateStr(startDate);

  const [sessRes, usersRes, holidayRes, cfg] = await Promise.all([
    supabase
      .from('attendance')
      .select('user_id, check_in_time, check_out_time, total_duration, date')
      .gte('check_in_time', `${startStr}T00:00:00`)
      .order('check_in_time', { ascending: true }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    getHolidaysForYear(now.getFullYear()).catch(() => []),
    getPunctualityConfig(),
  ]);

  if (sessRes.error) throw new Error(sessRes.error.message);

  const isLate          = makeIsLate(cfg);
  const isEarlyCheckout = makeIsEarlyCheckout(cfg);

  const sessions = sessRes.data || [];
  const totalUsers = (usersRes.data?.users || []).length || 1;
  const holidaySet = buildHolidaySet(holidayRes);
  const emailMap   = Object.fromEntries((usersRes.data?.users || []).map((u) => [u.id, u.email]));

  // Per-day stats
  const buildDateRange = (s, e) => {
    const r = []; const d = new Date(s + 'T00:00:00'); const end = new Date(e + 'T00:00:00');
    while (d <= end) { r.push(toDateStr(d)); d.setDate(d.getDate() + 1); }
    return r;
  };
  const dateRange = buildDateRange(startStr, todayStr)
    .filter((d) => isWeekday(d) && !holidaySet.has(d));

  const dayMap = {}; // date → { on_time, late, earlyOut }
  const userStats = {}; // userId → { lateCount, onTimeCount, earlyCount }

  for (const s of sessions) {
    if (!s.check_in_time) continue;
    const d = s.date || s.check_in_time.split('T')[0];
    if (!dayMap[d]) dayMap[d] = { onTime: 0, late: 0, earlyOut: 0 };
    if (!userStats[s.user_id]) userStats[s.user_id] = { late: 0, onTime: 0, early: 0, total: 0 };
    userStats[s.user_id].total++;
    if (isLate(s.check_in_time)) {
      dayMap[d].late++;
      userStats[s.user_id].late++;
    } else {
      dayMap[d].onTime++;
      userStats[s.user_id].onTime++;
    }
    if (isEarlyCheckout(s.check_out_time)) {
      dayMap[d].earlyOut++;
      userStats[s.user_id].early++;
    }
  }

  const dailyPunctuality = dateRange.map((d) => {
    const dm = dayMap[d] || { onTime: 0, late: 0, earlyOut: 0 };
    const total = dm.onTime + dm.late;
    return {
      date:    d,
      onTime:  dm.onTime,
      late:    dm.late,
      earlyOut: dm.earlyOut,
      lateRate: total > 0 ? Math.round((dm.late / total) * 100) : 0,
    };
  });

  // Top late arrivals (people with most late check-ins)
  const mostLate = Object.entries(userStats)
    .filter(([, v]) => v.late > 0)
    .map(([uid, v]) => ({
      userId:    uid,
      email:     emailMap[uid] || uid,
      late:      v.late,
      onTime:    v.onTime,
      total:     v.total,
      lateRate:  Math.round((v.late / v.total) * 100),
    }))
    .sort((a, b) => b.late - a.late)
    .slice(0, 5);

  const totalSessions = sessions.length;
  const totalLate     = sessions.filter((s) => s.check_in_time && isLate(s.check_in_time)).length;
  const orgLateRate   = totalSessions > 0 ? Math.round((totalLate / totalSessions) * 100) : 0;

  return {
    dailyPunctuality,
    mostLate,
    summary: {
      orgLateRate,
      totalLate,
      totalOnTime: totalSessions - totalLate,
      totalSessions,
      lateThreshold: `${pad2(cfg.lateHour)}:${pad2(cfg.lateMin)}`,
    },
  };
};

module.exports = { getPersonalPunctuality, getOrgPunctuality };
