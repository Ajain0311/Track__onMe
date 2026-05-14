// services/attendanceService.js
// Supabase/PostgreSQL operations for the attendance table.

const { supabase } = require('./supabase');

// Map DB snake_case columns → camelCase for API responses
const mapRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  checkInTime: row.check_in_time,
  checkOutTime: row.check_out_time,
  totalDuration: row.total_duration,
  date: row.date,
  latitude: row.latitude ?? null,
  longitude: row.longitude ?? null,
  accuracy: row.accuracy ?? null,
  checkInMethod: row.check_in_method ?? 'wifi',
  locationId: row.location_id ?? null,
  locationName: row.location_name ?? null,
  createdAt: row.created_at,
});

/**
 * Create a new check-in record.
 * @param {string} userId
 * @param {{ latitude, longitude, accuracy, method }|null} location
 */
const createCheckIn = async (userId, location = null) => {
  const now = new Date();
  const { data, error } = await supabase
    .from('attendance')
    .insert({
      user_id: userId,
      check_in_time: now.toISOString(),
      check_out_time: null,
      total_duration: null,
      date: now.toISOString().split('T')[0],
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      accuracy: location?.accuracy ?? null,
      check_in_method: location?.locationId ? 'location' : location ? 'gps' : 'wifi',
      location_id: location?.locationId ?? null,
      location_name: location?.locationName ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Check-in failed: ${error.message}`);
  return mapRow(data);
};

/**
 * Find the latest active (unchecked-out) session for a user.
 */
const getActiveSession = async (userId) => {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('user_id', userId)
    .is('check_out_time', null)
    .order('check_in_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Active session query failed: ${error.message}`);
  return data ? mapRow(data) : null;
};

/**
 * Update a record with checkout time and total duration (in minutes).
 */
const updateCheckOut = async (recordId, checkInTime) => {
  const now = new Date();
  const totalDuration = Math.round((now - new Date(checkInTime)) / 60000);

  const { data, error } = await supabase
    .from('attendance')
    .update({
      check_out_time: now.toISOString(),
      total_duration: totalDuration,
    })
    .eq('id', recordId)
    .select()
    .single();

  if (error) throw new Error(`Check-out failed: ${error.message}`);
  return mapRow(data);
};

/**
 * Get all attendance records for a user sorted by check-in time descending.
 */
const getUserAttendance = async (userId) => {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('user_id', userId)
    .order('check_in_time', { ascending: false });

  if (error) throw new Error(`Attendance query failed: ${error.message}`);
  return data.map(mapRow);
};

/**
 * Group raw attendance rows by calendar day.
 * Sums completed session minutes; open sessions contribute elapsed minutes so far.
 */
const buildDailySummaries = (records) => {
  const now = Date.now();
  const map = new Map();

  for (const r of records) {
    const day = r.date || (r.checkInTime ? String(r.checkInTime).split('T')[0] : null);
    if (!day) continue;

    if (!map.has(day)) {
      map.set(day, {
        date: day,
        totalMinutes: 0,
        sessionCount: 0,
        hasOpenSession: false,
        sessions: [],
      });
    }

    const entry = map.get(day);
    entry.sessionCount += 1;
    entry.sessions.push({
      id: r.id,
      checkInTime: r.checkInTime,
      checkOutTime: r.checkOutTime,
      totalDuration: r.totalDuration,
    });

    if (r.checkOutTime != null && typeof r.totalDuration === 'number') {
      entry.totalMinutes += r.totalDuration;
    } else if (r.checkInTime) {
      const mins = Math.max(0, Math.round((now - new Date(r.checkInTime).getTime()) / 60000));
      entry.totalMinutes += mins;
      entry.hasOpenSession = true;
    }
  }

  for (const entry of map.values()) {
    entry.sessions.sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime));
  }

  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
};

module.exports = {
  createCheckIn,
  getActiveSession,
  updateCheckOut,
  getUserAttendance,
  buildDailySummaries,
};
