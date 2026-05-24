// controllers/attendanceController.js

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const {
  createCheckIn, getActiveSession, updateCheckOut,
  getUserAttendance, buildDailySummaries,
} = require('../services/attendanceService');
const activity = require('../services/activityService');
const { supabase } = require('../services/supabase');

// Haversine — meters between two GPS points
const distanceM = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Authorize a check-in: enforces that the user has access to the supplied
// location AND is physically within its radius (if GPS is provided).
const authorizeLocation = async (userId, { locationId, latitude, longitude }) => {
  if (!locationId) {
    throw AppError.badRequest(
      'Please pick a work location before checking in. ' +
      'If you don\'t see your location yet, submit a request to your admin.'
    );
  }

  const { data: loc, error } = await supabase
    .from('locations')
    .select('id, name, is_active, is_global, radius_meters, latitude, longitude')
    .eq('id', locationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!loc) throw AppError.badRequest('That location no longer exists.');
  if (!loc.is_active) throw AppError.badRequest('That location is currently inactive.');

  // Access check: global OR explicit per-user grant. Defense-in-depth on top
  // of the frontend picker — clients can't bypass this by hand-crafting requests.
  let hasAccess = !!loc.is_global;
  if (!hasAccess) {
    const { data: grant } = await supabase
      .from('user_locations')
      .select('user_id')
      .eq('user_id', userId)
      .eq('location_id', loc.id)
      .maybeSingle();
    hasAccess = !!grant;
  }
  // Also check the newer user_location_access table (post-migration-003)
  if (!hasAccess) {
    try {
      const { data: g2 } = await supabase
        .from('user_location_access')
        .select('user_id')
        .eq('user_id', userId)
        .eq('location_id', loc.id)
        .is('revoked_at', null)
        .maybeSingle();
      hasAccess = !!g2;
    } catch { /* table missing pre-migration — already covered above */ }
  }

  if (!hasAccess) {
    throw AppError.forbidden(
      'You don\'t have access to this location yet. ' +
      'Ask your admin to approve your request.'
    );
  }

  // Geofence check — when GPS is provided, the user MUST be within the location's
  // radius. This catches "check-in from home using an approved office location".
  if (latitude != null && longitude != null && loc.latitude != null && loc.longitude != null) {
    const meters = distanceM(parseFloat(latitude), parseFloat(longitude), loc.latitude, loc.longitude);
    const radius = loc.radius_meters || 200;
    if (meters > radius * 1.5) {
      throw AppError.badRequest(
        `You're ${Math.round(meters)}m from "${loc.name}" (allowed: ${radius}m). ` +
        'Move closer or check in via approved WiFi.'
      );
    }
  }

  return loc;
};

// POST /api/checkin
const checkIn = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { latitude, longitude, accuracy, locationId, locationName } = req.body || {};

  const active = await getActiveSession(userId);
  if (active) throw AppError.badRequest('Already checked in. Please check out before checking in again.');

  // ALWAYS verify location access — even if frontend already filtered.
  await authorizeLocation(userId, { locationId, latitude, longitude });

  const location = (latitude != null && longitude != null)
    ? {
        latitude:     parseFloat(latitude),
        longitude:    parseFloat(longitude),
        accuracy:     accuracy != null ? parseFloat(accuracy) : null,
        locationId,
        locationName: locationName || null,
      }
    : { locationId, locationName: locationName || null };

  const record = await createCheckIn(userId, location);

  await activity.record({
    userId, type: 'check_in', title: 'Checked in',
    description: record.locationName || 'Approved location',
    metadata: { attendanceId: record.id, method: record.checkInMethod, locationId },
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
