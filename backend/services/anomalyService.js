// services/anomalyService.js — Attendance anomaly detection

const { supabase } = require('./supabase');
const { getHolidaysForYear, buildHolidaySet } = require('./holidayService');

const pad2 = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const getLocalHour = (iso) => new Date(iso).getHours();
const getLocalMin  = (iso) => new Date(iso).getMinutes();

// Session durations < this are suspiciously short (seconds)
const MIN_REAL_SESSION_SECS = 15 * 60;
// Check-in before this hour is unusual (5 AM)
const UNUSUAL_EARLY_HOUR = 5;
// Check-in after this hour is unusual (11 PM)
const UNUSUAL_LATE_HOUR  = 23;
// Exact-minute repetition: if N sessions start within ±1 minute of the same clock-minute
const EXACT_TIME_REPEAT_THRESHOLD = 3;

const ANOMALY_TYPES = {
  SHORT_SESSION:    'short_session',
  UNUSUAL_HOUR:     'unusual_hour',
  WEEKEND_CHECKIN:  'weekend_checkin',
  HOLIDAY_CHECKIN:  'holiday_checkin',
  EXACT_TIME_REPEAT:'exact_time_repeat',
  RAPID_RECHECKIN:  'rapid_recheckin',  // checked in again < 5 min after checkout
};

const detectAnomalies = async ({ days = 30 } = {}) => {
  const now = new Date();
  const todayStr = toDateStr(now);
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (days - 1));
  const startStr = toDateStr(startDate);
  const year = now.getFullYear();

  const [attendanceRes, usersRes, profilesRes, holidays] = await Promise.all([
    supabase
      .from('attendance')
      .select('id, user_id, check_in_time, check_out_time, total_duration, date, location_name')
      .gte('check_in_time', `${startStr}T00:00:00`)
      .order('check_in_time', { ascending: true }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase
      .from('employee_profiles')
      .select('user_id, display_name, designation, department_id, departments(name)'),
    getHolidaysForYear(year).catch(() => []),
  ]);

  if (attendanceRes.error) throw new Error(attendanceRes.error.message);

  const sessions   = attendanceRes.data || [];
  const allUsers   = usersRes.data?.users || [];
  const profiles   = profilesRes.data || [];
  const holidaySet = buildHolidaySet(holidays);

  const emailMap   = Object.fromEntries(allUsers.map((u) => [u.id, u.email]));
  const profileMap = Object.fromEntries(profiles.map((p) => [p.user_id, p]));

  const anomalies = [];

  // Group sessions by user for per-user analysis
  const byUser = {};
  for (const s of sessions) {
    if (!byUser[s.user_id]) byUser[s.user_id] = [];
    byUser[s.user_id].push(s);
  }

  for (const [userId, userSessions] of Object.entries(byUser)) {
    const profile = profileMap[userId];
    const email   = emailMap[userId] || userId;
    const name    = profile?.display_name || null;
    const dept    = profile?.departments?.name || null;

    // Track check-in minutes for exact-time detection
    const checkInMinutes = {};  // minute-of-day → count

    for (const s of userSessions) {
      const checkInHour = getLocalHour(s.check_in_time);
      const checkInMin  = getLocalMin(s.check_in_time);
      const dateStr     = s.date || s.check_in_time.split('T')[0];
      const dow         = new Date(dateStr + 'T00:00:00').getDay(); // 0=Sun
      const isWeekend   = dow === 0 || dow === 6;
      const isHoliday   = holidaySet.has(dateStr);

      // Short session (only if checked out)
      if (s.check_out_time && s.total_duration !== null && s.total_duration < MIN_REAL_SESSION_SECS) {
        anomalies.push({
          type:        ANOMALY_TYPES.SHORT_SESSION,
          userId, email, name, dept,
          date:        dateStr,
          sessionId:   s.id,
          detail:      `Session lasted only ${Math.round((s.total_duration || 0) / 60)} minutes`,
          checkInTime: s.check_in_time,
          severity:    'medium',
        });
      }

      // Unusual hour
      if (checkInHour < UNUSUAL_EARLY_HOUR || checkInHour >= UNUSUAL_LATE_HOUR) {
        anomalies.push({
          type:        ANOMALY_TYPES.UNUSUAL_HOUR,
          userId, email, name, dept,
          date:        dateStr,
          sessionId:   s.id,
          detail:      `Checked in at ${pad2(checkInHour)}:${pad2(checkInMin)} (unusual hour)`,
          checkInTime: s.check_in_time,
          severity:    'low',
        });
      }

      // Weekend check-in (may be legitimate for some roles, but flag it)
      if (isWeekend) {
        anomalies.push({
          type:        ANOMALY_TYPES.WEEKEND_CHECKIN,
          userId, email, name, dept,
          date:        dateStr,
          sessionId:   s.id,
          detail:      `Checked in on ${dow === 0 ? 'Sunday' : 'Saturday'}`,
          checkInTime: s.check_in_time,
          severity:    'low',
        });
      }

      // Holiday check-in
      if (isHoliday) {
        anomalies.push({
          type:        ANOMALY_TYPES.HOLIDAY_CHECKIN,
          userId, email, name, dept,
          date:        dateStr,
          sessionId:   s.id,
          detail:      'Checked in on a public holiday',
          checkInTime: s.check_in_time,
          severity:    'low',
        });
      }

      // Track exact minutes
      const minuteKey = checkInHour * 60 + checkInMin;
      checkInMinutes[minuteKey] = (checkInMinutes[minuteKey] || 0) + 1;
    }

    // Rapid re-check-in: checked in < 5 min after last checkout
    const sorted = [...userSessions].sort((a, b) => new Date(a.check_in_time) - new Date(b.check_in_time));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (!prev.check_out_time) continue;
      const gapMs = new Date(curr.check_in_time) - new Date(prev.check_out_time);
      if (gapMs > 0 && gapMs < 5 * 60 * 1000) {
        anomalies.push({
          type:        ANOMALY_TYPES.RAPID_RECHECKIN,
          userId, email, name, dept,
          date:        curr.date || curr.check_in_time.split('T')[0],
          sessionId:   curr.id,
          detail:      `Re-checked in ${Math.round(gapMs / 60000)} min after checkout`,
          checkInTime: curr.check_in_time,
          severity:    'high',
        });
      }
    }

    // Exact-time repetition
    for (const [minuteKey, count] of Object.entries(checkInMinutes)) {
      if (count >= EXACT_TIME_REPEAT_THRESHOLD) {
        const h = Math.floor(minuteKey / 60), m = minuteKey % 60;
        anomalies.push({
          type:        ANOMALY_TYPES.EXACT_TIME_REPEAT,
          userId, email, name, dept,
          date:        null,
          sessionId:   null,
          detail:      `Checked in at exactly ${pad2(h)}:${pad2(m)} on ${count} different days`,
          checkInTime: null,
          severity:    'high',
        });
      }
    }
  }

  // Sort: high → medium → low, then by date desc
  const order = { high: 0, medium: 1, low: 2 };
  anomalies.sort((a, b) => {
    const sv = order[a.severity] - order[b.severity];
    if (sv !== 0) return sv;
    return (b.checkInTime || '') > (a.checkInTime || '') ? 1 : -1;
  });

  // Summary
  const highCount   = anomalies.filter((a) => a.severity === 'high').length;
  const mediumCount = anomalies.filter((a) => a.severity === 'medium').length;
  const lowCount    = anomalies.filter((a) => a.severity === 'low').length;
  const uniqueUsers = new Set(anomalies.map((a) => a.userId)).size;

  return {
    anomalies,
    summary: { total: anomalies.length, highCount, mediumCount, lowCount, uniqueUsers, period: days },
  };
};

module.exports = { detectAnomalies };
