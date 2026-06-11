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

// ── HTML Report Builders ─────────────────────────────────────────────────────

const HTML_BASE_STYLES = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
       font-size:13px;color:#1a1a2e;background:#fff;padding:24px}
  .header{border-bottom:2px solid #6c63ff;padding-bottom:14px;margin-bottom:20px;
          display:flex;justify-content:space-between;align-items:flex-start}
  .brand{font-size:20px;font-weight:900;color:#6c63ff;letter-spacing:-0.5px}
  .brand span{color:#3ee8c7}
  .report-meta{text-align:right}
  .report-title{font-size:18px;font-weight:800;color:#1a1a2e;margin-bottom:4px}
  .report-sub{font-size:12px;color:#666}
  .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
  .stat-box{background:#f7f7ff;border:1px solid #e0deff;border-radius:10px;
            padding:12px;text-align:center}
  .stat-val{font-size:22px;font-weight:900;color:#6c63ff}
  .stat-lbl{font-size:11px;color:#888;margin-top:3px;font-weight:600}
  h2{font-size:13px;font-weight:800;color:#888;letter-spacing:0.8px;
     text-transform:uppercase;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead tr{background:#6c63ff;color:#fff}
  thead th{padding:10px 12px;text-align:left;font-size:12px;font-weight:700}
  tbody tr:nth-child(even){background:#f7f7ff}
  tbody td{padding:8px 12px;font-size:12px;border-bottom:1px solid #eee}
  .badge{display:inline-block;padding:2px 8px;border-radius:10px;
         font-size:11px;font-weight:700}
  .badge-green{background:#e6fff9;color:#00b894;border:1px solid #3ee8c7}
  .badge-amber{background:#fff8e6;color:#e17055;border:1px solid #ffb347}
  .badge-red  {background:#ffe6e6;color:#d63031;border:1px solid #ff7b9c}
  .footer{margin-top:24px;border-top:1px solid #eee;padding-top:12px;
          font-size:11px;color:#aaa;display:flex;justify-content:space-between}
  .no-print{margin-top:16px;text-align:center}
  .print-btn{background:#6c63ff;color:#fff;border:none;border-radius:8px;
             padding:10px 24px;font-size:14px;font-weight:700;cursor:pointer}
  @media print{
    .no-print{display:none!important}
    body{padding:0}
    thead tr{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .stat-box{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }
`;

const nowStr = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const buildAttendanceHtml = (records, summary, { startDate, endDate } = {}) => {
  const totalDays = summary.reduce((s, r) => s + r.presentDays, 0);
  const totalHrs  = Math.round(summary.reduce((s, r) => s + r.totalHours, 0) * 10) / 10;
  const avgHrs    = summary.length > 0 ? Math.round(totalHrs / summary.length * 10) / 10 : 0;
  const periodLabel = (startDate && endDate) ? `${startDate} — ${endDate}` : 'All time';

  const rows = summary.map((r) => `
    <tr>
      <td>${r.email}</td>
      <td style="text-align:center;font-weight:700;color:#00b894">${r.presentDays}</td>
      <td style="text-align:center;font-weight:700;color:#6c63ff">${r.totalHours}h</td>
      <td style="text-align:center;color:#888">${r.avgHours}h</td>
      <td style="text-align:center;color:#888">${r.sessions}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Attendance Report - AttendTrack</title>
<style>${HTML_BASE_STYLES}</style></head><body>
<div class="header">
  <div>
    <div class="brand">Attend<span>Track</span></div>
    <div style="font-size:11px;color:#888;margin-top:3px">Workforce Attendance Platform</div>
  </div>
  <div class="report-meta">
    <div class="report-title">Attendance Report</div>
    <div class="report-sub">Period: ${periodLabel}</div>
    <div class="report-sub">Generated: ${nowStr()}</div>
  </div>
</div>
<div class="stats-grid">
  <div class="stat-box"><div class="stat-val">${summary.length}</div><div class="stat-lbl">Employees</div></div>
  <div class="stat-box"><div class="stat-val">${totalDays}</div><div class="stat-lbl">Total Days</div></div>
  <div class="stat-box"><div class="stat-val">${totalHrs}h</div><div class="stat-lbl">Total Hours</div></div>
  <div class="stat-box"><div class="stat-val">${avgHrs}h</div><div class="stat-lbl">Avg / Person</div></div>
</div>
<h2>Employee Breakdown</h2>
<table>
  <thead><tr>
    <th>Employee</th><th style="text-align:center">Days Present</th>
    <th style="text-align:center">Total Hours</th><th style="text-align:center">Avg / Day</th>
    <th style="text-align:center">Sessions</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">
  <span>AttendTrack &copy; ${new Date().getFullYear()}</span>
  <span>${summary.length} employee${summary.length !== 1 ? 's' : ''} · ${totalDays} days · ${records.length} sessions</span>
</div>
<div class="no-print">
  <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
</div>
<script>if(window.opener||!document.referrer){setTimeout(()=>window.print(),400)}</script>
</body></html>`;
};

const buildLeaveHtml = (records, { startDate, endDate } = {}) => {
  const statusCounts = records.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  const totalDays    = records.reduce((s, r) => s + r.days, 0);
  const periodLabel  = (startDate && endDate) ? `${startDate} — ${endDate}` : 'All time';

  const badgeClass = (s) => s === 'approved' ? 'badge-green' : s === 'pending' ? 'badge-amber' : 'badge-red';

  const rows = records.map((r) => `
    <tr>
      <td>${r.email}</td>
      <td>${r.leaveType}</td>
      <td style="text-align:center">${r.startDate}</td>
      <td style="text-align:center">${r.endDate}</td>
      <td style="text-align:center;font-weight:700">${r.days}</td>
      <td style="text-align:center"><span class="badge ${badgeClass(r.status)}">${r.status}</span></td>
      <td style="color:#888;font-size:11px">${r.adminNote || '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Leave Report - AttendTrack</title>
<style>${HTML_BASE_STYLES}</style></head><body>
<div class="header">
  <div>
    <div class="brand">Attend<span>Track</span></div>
    <div style="font-size:11px;color:#888;margin-top:3px">Workforce Attendance Platform</div>
  </div>
  <div class="report-meta">
    <div class="report-title">Leave Report</div>
    <div class="report-sub">Period: ${periodLabel}</div>
    <div class="report-sub">Generated: ${nowStr()}</div>
  </div>
</div>
<div class="stats-grid">
  <div class="stat-box"><div class="stat-val">${records.length}</div><div class="stat-lbl">Total Requests</div></div>
  <div class="stat-box"><div class="stat-val" style="color:#00b894">${statusCounts.approved||0}</div><div class="stat-lbl">Approved</div></div>
  <div class="stat-box"><div class="stat-val" style="color:#e17055">${statusCounts.pending||0}</div><div class="stat-lbl">Pending</div></div>
  <div class="stat-box"><div class="stat-val" style="color:#d63031">${totalDays}</div><div class="stat-lbl">Total Days</div></div>
</div>
<h2>Leave Details</h2>
<table>
  <thead><tr>
    <th>Employee</th><th>Leave Type</th><th style="text-align:center">Start</th>
    <th style="text-align:center">End</th><th style="text-align:center">Days</th>
    <th style="text-align:center">Status</th><th>Admin Note</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">
  <span>AttendTrack &copy; ${new Date().getFullYear()}</span>
  <span>${records.length} request${records.length !== 1 ? 's' : ''} · ${totalDays} total days</span>
</div>
<div class="no-print">
  <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
</div>
<script>if(window.opener||!document.referrer){setTimeout(()=>window.print(),400)}</script>
</body></html>`;
};

module.exports = {
  fetchAttendanceReport,
  buildSummary,
  buildDetailCsv,
  buildSummaryCsv,
  fetchLeaveReport,
  buildLeaveCsv,
  buildAttendanceHtml,
  buildLeaveHtml,
};
