// controllers/attendanceController.js

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const {
  createCheckIn, getActiveSession, updateCheckOut,
  getUserAttendance, buildDailySummaries,
} = require('../services/attendanceService');
const activity = require('../services/activityService');

// POST /api/checkin
const checkIn = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { latitude, longitude, accuracy, locationId, locationName } = req.body || {};

  const active = await getActiveSession(userId);
  if (active) throw AppError.badRequest('Already checked in. Please check out before checking in again.');

  const location = (latitude != null && longitude != null)
    ? {
        latitude:     parseFloat(latitude),
        longitude:    parseFloat(longitude),
        accuracy:     accuracy != null ? parseFloat(accuracy) : null,
        locationId:   locationId   || null,
        locationName: locationName || null,
      }
    : (locationId ? { locationId, locationName: locationName || null } : null);

  const record = await createCheckIn(userId, location);

  await activity.record({
    userId, type: 'check_in', title: 'Checked in',
    description: record.locationName || 'GPS / WiFi',
    metadata: { attendanceId: record.id, method: record.checkInMethod },
  });

  res.status(201).json({ message: 'Checked in successfully.', record });
});

// POST /api/checkout
const checkOut = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const active = await getActiveSession(userId);
  if (!active) throw AppError.badRequest('No active session found. Please check in first.');

  const record = await updateCheckOut(active.id, active.checkInTime);

  await activity.record({
    userId, type: 'check_out', title: 'Checked out',
    description: `${record.totalDuration ?? 0} min session`,
    metadata: { attendanceId: record.id, durationMinutes: record.totalDuration },
  });

  res.json({ message: 'Checked out successfully.', record });
});

// GET /api/attendance/daily
const getAttendanceDaily = asyncHandler(async (req, res) => {
  const records = await getUserAttendance(req.user.id);
  res.json({ days: buildDailySummaries(records) });
});

// GET /api/attendance
const getAttendance = asyncHandler(async (req, res) => {
  const records = await getUserAttendance(req.user.id);
  res.json({ records });
});

// GET /api/status
const getStatus = asyncHandler(async (req, res) => {
  const active = await getActiveSession(req.user.id);
  res.json({ isCheckedIn: !!active, activeSession: active || null });
});

module.exports = { checkIn, checkOut, getAttendanceDaily, getAttendance, getStatus };
