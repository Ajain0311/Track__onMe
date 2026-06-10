// services/reportService.js — Attendance reporting and CSV export

const { supabase } = require('./supabase');

// ── Helpers ────────────────────────────────────────────────────────────────

const pad2 = (n) => String(n).padStart(2, '0');

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return '0h 0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
};

const formatDate = (iso) => {
  if (!iso) return '';
  return iso.split('T')[0];
};

const formatDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${formatDate(iso)} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};

const escapeCsv = (val) => {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

// ── Data Fetcher ────────────────────────────────────────────────────────────

const fetchAttendanceReport = async ({ startDate, endDate, userId, departmentId, limit = 1000 }) => {
  let query = supabase
    .from('attendance')
    .select(`
      id,
      user_id,
      check_in_time,
      check_out_time,
      total_duration,
      location_name,
      created_at
    `)
    .order('check_in_time', { ascending: false })
    .limit(limit);

  if (startDate) query = query.gte('check_in_time', `${startDate}T00:00:00`);
  if (endDate)   query = query.lte('check_in_time', `${endDate}T23:59:59`);
  if (userId)    query = query.eq('user_id', userId);

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  // Resolve emails from auth admin API (best-effort)
  let emailMap = {};
  try {
    const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    (usersData?.users || []).forEach((u) => { emailMap[u.id] = u.email; });
  } catch (_) { /* non-fatal */ }

  // Resolve department names if filtering by dept
  let deptUserIds = null;
  if (departmentId) {
    const { data: empProfiles } = await supabase
      .from('employee_profiles')
      .select('user_id')
      .eq('department_id', departmentId);
    deptUserIds = new Set((empProfiles || []).map((p) => p.user_id));
  }

  const records = (rows || [])
    .filter((r) => !deptUserIds || deptUserIds.has(r.user_id))
    .map((r) => ({
      id:           r.id,
      userId:       r.user_id,
      email:        emailMap[r.user_id] || r.user_id,
      date:         formatDate(r.check_in_time),
      checkInTime:  r.check_in_time,
      checkOutTime: r.check_out_time,
      durationSecs: r.total_duration || 0,
      durationFmt:  formatDuration(r.total_duration),
      locationName: r.location_name || '',
    }));

  return records;
};

// ── Summary Generator ────────────────────────────────────────────────────────

const buildSummary = (records) => {
  const byUser = {};
  for (const r of records) {
    if (!byUser[r.userId]) {
      byUser[r.userId] = { email: r.email, days: 0, totalSecs: 0, sessions: 0 };
    }
    byUser[r.userId].days++;
    byUser[r.userId].sessions++;
    byUser[r.userId].totalSecs += r.durationSecs;
  }
  return Object.values(byUser).map((u) => ({
    email:       u.email,
    presentDays: u.days,
    totalHours:  Math.round(u.totalSecs / 3600 * 10) / 10,
    sessions:    u.sessions,
    avgHours:    u.days > 0 ? Math.round((u.totalSecs / u.days / 3600) * 10) / 10 : 0,
  }));
};

// ── CSV Builder ──────────────────────────────────────────────────────────────

const buildDetailCsv = (records) => {
  const headers = ['Date', 'Employee Email', 'Check In', 'Check Out', 'Duration', 'Location'];
  const lines = [headers.join(',')];
  for (const r of records) {
    lines.push([
      escapeCsv(r.date),
      escapeCsv(r.email),
      escapeCsv(formatDateTime(r.checkInTime)),
      escapeCsv(r.checkOutTime ? formatDateTime(r.checkOutTime) : 'Active'),
      escapeCsv(r.durationFmt),
      escapeCsv(r.locationName),
    ].join(','));
  }
  return lines.join('\n');
};

const buildSummaryCsv = (summary) => {
  const headers = ['Employee Email', 'Present Days', 'Total Hours', 'Avg Hours/Day', 'Sessions'];
  const lines = [headers.join(',')];
  for (const s of summary) {
    lines.push([
      escapeCsv(s.email),
      escapeCsv(s.presentDays),
      escapeCsv(s.totalHours),
      escapeCsv(s.avgHours),
      escapeCsv(s.sessions),
    ].join(','));
  }
  return lines.join('\n');
};

// ── Leave Report ────────────────────────────────────────────────────────────

const fetchLeaveReport = async ({ startDate, endDate, userId, status } = {}) => {
  let query = supabase
    .from('leaves')
    .select(`
      id, user_id, start_date, end_date, days, reason, status, admin_note,
      leave_types(name, color),
      reviewed_at, created_at
    `)
    .order('created_at', { ascending: false })
    .limit(500);

  if (startDate) query = query.gte('start_date', startDate);
  if (endDate)   query = query.lte('end_date', endDate);
  if (userId)    query = query.eq('user_id', userId);
  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Resolve emails from auth admin API (best-effort)
  let emailMap = {};
  try {
    const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    (usersData?.users || []).forEach((u) => { emailMap[u.id] = u.email; });
  } catch (_) { /* non-fatal */ }

  return (data || []).map((r) => ({
    userId:    r.user_id,
    email:     emailMap[r.user_id] || r.user_id,
    leaveType: r.leave_types?.name || 'Unknown',
    startDate: r.start_date,
    endDate:   r.end_date,
    days:      r.days,
    status:    r.status,
    adminNote: r.admin_note || '',
    reason:    r.reason,
    createdAt: formatDate(r.created_at),
  }));
};

const buildLeaveCsv = (records) => {
  const headers = ['Employee Email', 'Leave Type', 'Start Date', 'End Date', 'Days', 'Status', 'Applied On', 'Admin Note'];
  const lines = [headers.join(',')];
  for (const r of records) {
    lines.push([
      escapeCsv(r.email),
      escapeCsv(r.leaveType),
      escapeCsv(r.startDate),
      escapeCsv(r.endDate),
      escapeCsv(r.days),
      escapeCsv(r.status),
      escapeCsv(r.createdAt),
      escapeCsv(r.adminNote),
    ].join(','));
  }
  return lines.join('\n');
};

module.exports = {
  fetchAttendanceReport,
  buildSummary,
  buildDetailCsv,
  buildSummaryCsv,
  fetchLeaveReport,
  buildLeaveCsv,
};
