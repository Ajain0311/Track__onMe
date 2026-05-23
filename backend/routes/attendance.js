// routes/attendance.js

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { validate, UUID_RE } = require('../middleware/validate');
const rateLimit = require('../middleware/rateLimit');
const asyncHandler = require('../utils/asyncHandler');
const { getUserRole } = require('../services/adminService');
const activity = require('../services/activityService');
const {
  checkIn, checkOut, getAttendanceDaily, getAttendance, getStatus,
} = require('../controllers/attendanceController');

const checkInSchema = {
  latitude:     { type: 'number', min: -90,  max: 90  },
  longitude:    { type: 'number', min: -180, max: 180 },
  accuracy:     { type: 'number', min: 0 },
  locationId:   { type: 'uuid' },
  locationName: { type: 'string', max: 200 },
};

// Limit check-in/out attempts to 20/min/user to prevent abuse / accidental floods
const attendanceLimiter = rateLimit({ windowMs: 60_000, max: 20, key: (req) => req.user?.id || req.ip });

router.post('/checkin',  verifyToken, attendanceLimiter, validate({ body: checkInSchema }), checkIn);
router.post('/checkout', verifyToken, attendanceLimiter, checkOut);
router.get('/attendance/daily', verifyToken, getAttendanceDaily);
router.get('/attendance',       verifyToken, getAttendance);
router.get('/status',           verifyToken, getStatus);

// GET /api/me — identity + role
router.get('/me', verifyToken, asyncHandler(async (req, res) => {
  const role = await getUserRole(req.user.id);
  res.json({ id: req.user.id, email: req.user.email, role });
}));

// POST /api/me/track-login — frontend calls once on fresh login to record activity
router.post('/me/track-login', verifyToken, asyncHandler(async (req, res) => {
  await activity.record({
    userId: req.user.id,
    type:   'login',
    title:  'Signed in',
    description: req.body?.platform ? `via ${req.body.platform}` : null,
    metadata: { userAgent: req.headers['user-agent'] },
  });
  res.json({ ok: true });
}));

module.exports = router;
