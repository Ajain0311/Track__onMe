// routes/reports.js — all admin report endpoints

const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const {
  getAttendanceReport, exportAttendanceCsv,
  getLeaveReport,      exportLeaveCsv,
} = require('../controllers/reportController');

// All report endpoints are admin-only
router.use(verifyToken, requireRole(['admin', 'manager']));

router.get('/attendance',     getAttendanceReport);
router.get('/attendance/csv', exportAttendanceCsv);
router.get('/leaves',         getLeaveReport);
router.get('/leaves/csv',     exportLeaveCsv);

module.exports = router;
