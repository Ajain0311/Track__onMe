// routes/attendance.js
// Defines all attendance-related API routes.

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  checkIn,
  checkOut,
  getAttendanceDaily,
  getAttendance,
  getStatus,
} = require('../controllers/attendanceController');

// All routes below require a valid Firebase ID token
router.post('/checkin', verifyToken, checkIn);
router.post('/checkout', verifyToken, checkOut);
router.get('/attendance/daily', verifyToken, getAttendanceDaily);
router.get('/attendance', verifyToken, getAttendance);
router.get('/status', verifyToken, getStatus);

module.exports = router;
