// routes/attendance.js

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { getUserRole } = require('../services/adminService');
const {
  checkIn,
  checkOut,
  getAttendanceDaily,
  getAttendance,
  getStatus,
} = require('../controllers/attendanceController');

router.post('/checkin', verifyToken, checkIn);
router.post('/checkout', verifyToken, checkOut);
router.get('/attendance/daily', verifyToken, getAttendanceDaily);
router.get('/attendance', verifyToken, getAttendance);
router.get('/status', verifyToken, getStatus);

// GET /api/me — returns user identity + role (used by frontend to show admin tab)
router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const role = await getUserRole(req.user.id);
    return res.status(200).json({ id: req.user.id, email: req.user.email, role });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
