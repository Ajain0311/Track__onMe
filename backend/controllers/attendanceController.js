// controllers/attendanceController.js
// Business logic for all attendance routes.

const {
  createCheckIn,
  getActiveSession,
  updateCheckOut,
  getUserAttendance,
  buildDailySummaries,
} = require('../services/attendanceService');

/**
 * POST /checkin
 * Creates a new check-in record if user has no active session.
 */
const checkIn = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude, accuracy } = req.body || {};

    const activeSession = await getActiveSession(userId);
    if (activeSession) {
      return res.status(400).json({
        error: 'Already checked in. Please check out before checking in again.',
      });
    }

    const location =
      latitude != null && longitude != null
        ? { latitude: parseFloat(latitude), longitude: parseFloat(longitude), accuracy: accuracy ? parseFloat(accuracy) : null }
        : null;

    const record = await createCheckIn(userId, location);
    console.log(`[CheckIn] User ${userId} via ${record.checkInMethod} at ${record.checkInTime}`);

    return res.status(201).json({ message: 'Checked in successfully.', record });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /checkout
 * Closes the latest active session for the user.
 */
const checkOut = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const activeSession = await getActiveSession(userId);
    if (!activeSession) {
      return res.status(400).json({
        error: 'No active session found. Please check in first.',
      });
    }

    const record = await updateCheckOut(activeSession.id, activeSession.checkInTime);
    console.log(`[CheckOut] User ${userId} checked out. Duration: ${record.totalDuration} min`);

    return res.status(200).json({ message: 'Checked out successfully.', record });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /attendance/daily
 * Per-day totals (minutes + session count); sessions nested for detail.
 */
const getAttendanceDaily = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const records = await getUserAttendance(userId);
    const days = buildDailySummaries(records);
    return res.status(200).json({ days });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /attendance
 * Returns all attendance records for the logged-in user.
 */
const getAttendance = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const records = await getUserAttendance(userId);
    return res.status(200).json({ records });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /status
 * Returns whether the user currently has an active check-in session.
 */
const getStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const activeSession = await getActiveSession(userId);

    return res.status(200).json({
      isCheckedIn: !!activeSession,
      activeSession: activeSession || null,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { checkIn, checkOut, getAttendanceDaily, getAttendance, getStatus };
