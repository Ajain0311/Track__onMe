// controllers/reportController.js — Attendance and leave reporting

const asyncHandler = require('../utils/asyncHandler');
const {
  fetchAttendanceReport, buildSummary, buildDetailCsv, buildSummaryCsv,
  fetchLeaveReport, buildLeaveCsv, buildAttendanceHtml, buildLeaveHtml,
} = require('../services/reportService');

// GET /api/admin/reports/attendance
// Returns JSON with records + summary
const getAttendanceReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, userId, departmentId } = req.query;
  const records = await fetchAttendanceReport({ startDate, endDate, userId, departmentId });
  const summary = buildSummary(records);
  res.json({
    records: records.slice(0, 500), // cap JSON payload
    summary,
    total: records.length,
    params: { startDate, endDate, userId, departmentId },
  });
});

// GET /api/admin/reports/attendance/csv
// Streams CSV file download
const exportAttendanceCsv = asyncHandler(async (req, res) => {
  const { startDate, endDate, userId, departmentId, type = 'detail' } = req.query;
  const records = await fetchAttendanceReport({ startDate, endDate, userId, departmentId });

  let csv, filename;
  if (type === 'summary') {
    const summary = buildSummary(records);
    csv = buildSummaryCsv(summary);
    filename = `attendance-summary-${startDate || 'all'}-to-${endDate || 'all'}.csv`;
  } else {
    csv = buildDetailCsv(records);
    filename = `attendance-detail-${startDate || 'all'}-to-${endDate || 'all'}.csv`;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv); // BOM for Excel UTF-8 compatibility
});

// GET /api/admin/reports/leaves
const getLeaveReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, userId, status } = req.query;
  const records = await fetchLeaveReport({ startDate, endDate, userId, status });
  res.json({ records, total: records.length });
});

// GET /api/admin/reports/leaves/csv
const exportLeaveCsv = asyncHandler(async (req, res) => {
  const { startDate, endDate, userId, status } = req.query;
  const records = await fetchLeaveReport({ startDate, endDate, userId, status });
  const csv = buildLeaveCsv(records);
  const filename = `leaves-${startDate || 'all'}-to-${endDate || 'all'}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv);
});

// GET /api/admin/reports/attendance/pdf
// Returns print-ready HTML report for browser print-to-PDF
const exportAttendancePdf = asyncHandler(async (req, res) => {
  const { startDate, endDate, userId, departmentId } = req.query;
  const records = await fetchAttendanceReport({ startDate, endDate, userId, departmentId });
  const summary = buildSummary(records);
  const html = buildAttendanceHtml(records, summary, { startDate, endDate });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline');
  res.send(html);
});

// GET /api/admin/reports/leaves/pdf
const exportLeavePdf = asyncHandler(async (req, res) => {
  const { startDate, endDate, userId, status } = req.query;
  const records = await fetchLeaveReport({ startDate, endDate, userId, status });
  const html = buildLeaveHtml(records, { startDate, endDate });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline');
  res.send(html);
});

module.exports = {
  getAttendanceReport, exportAttendanceCsv, exportAttendancePdf,
  getLeaveReport,      exportLeaveCsv,      exportLeavePdf,
};
