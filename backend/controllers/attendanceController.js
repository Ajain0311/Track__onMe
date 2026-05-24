// controllers/attendanceController.js

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const {
  createCheckIn, getActiveSession, updateCheckOut,
  getUserAttendance, buildDailySummaries,
} = require('../services/attendanceService');
const activity = require('../services/activityService');
const { supabase } = require('../services/supabase');
const { verifyFaceToken } = require('../utils/signToken');
const logger = require('../utils/logger');

// ─── Haversine distance (meters) ──────────────────────────────────────────────
const distanceM = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Location authorization ───────────────────────────────────────────────────
// Defense-in-depth: even if the frontend shows only allowed locations, the
// backend re-validates access AND geofence on every check-in request.
const authorizeLocation = async (userId, { locationId, latitude, longitude }) => {
  if (!locationId) {
    throw AppError.badRequest(
      'Please pick a work location before checking in. ' +
      "If you don't see your location yet, submit a request to your admin."
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

  // Access check: global OR explicit per-user grant
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
    } catch {
      // table missing pre-migration — already covered by user_locations above
    }
  }

  if (!hasAccess) {
    throw AppError.forbidden(
      "You don't have access to this location yet. Ask your admin to approve your request."
    );
  }

  // Geofence: when GPS is provided the user MUST be within the location's radius
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

// ─── Face verification token validation ──────────────────────────────────────
// Validates the signed face token that the client must obtain from
// POST /api/face/verify (native) or POST /api/face/verify-web (web)
// BEFORE calling check-in or check-out.
//
// Returns { sim, mode } on success; throws AppError.forbidden on any failure.
const requireFaceToken = (faceToken, userId, expectedMode) => {
  if (!faceToken) {
    throw AppError.forbidden(
      'Face verification is required. Please verify your identity before checking ' +
      (expectedMode === 'checkout' ? 'out.' : 'in.')
    );
  }

  let payload;
  try {
    payload = verifyFaceToken(faceToken, userId, expectedMode);
  } catch (err) {
    logger.warn('Invalid/expired face token', { userId, mode: expectedMode, reason: err.message });
    throw AppError.forbidden(
      err.message === 'Face verification token expired — please re-verify your face'
        ? 'Face verification expired. Please re-verify your identity.'
        : 'Face verification token is invalid. Please re-verify your identity.'
    );
  }

  return payload; // { uid, mode, sim, exp, jti }
};

// ─── POST /api/checkin ────────────────────────────────────────────────────────
const checkIn = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { latitude, longitude, accuracy, locationId, locationName, faceToken } = req.body || {};

  // 1. Validate face verification token FIRST — reject immediately if missing/invalid
  const facePayload = requireFaceToken(faceToken, userId, 'checkin');

  // 2. Prevent double check-in
  const active = await getActiveSession(userId);
  if (active) {
    throw AppError.badRequest('Already checked in. Please check out before checking in again.');
  }

  // 3. Validate location access + geofence
  await authorizeLocation(userId, { locationId, latitude, longitude });

  // 4. Build location object
  const location = {
    latitude:     latitude  != null ? parseFloat(latitude)  : null,
    longitude:    longitude != null ? parseFloat(longitude) : null,
    accuracy:     accuracy  != null ? parseFloat(accuracy)  : null,
    locationId:   locationId ?? null,
    locationName: locationName ?? null,
  };

  // 5. Determine verification method from token payload
  //    sim === 1.0 means web password auth was used
  const method = facePayload.sim >= 0.999 ? 'web_password' : 'face_recognition';

  // 6. Insert attendance record (face verification metadata included)
  const record = await createCheckIn(userId, location, {
    faceVerified:    true,
    faceSimilarity:  facePayload.sim,
    verificationMethod: method,
  });

  // 7. Activity log (fail-soft)
  await activity.record({
    userId,
    type:        'check_in',
    title:       'Checked in',
    description: record.locationName || 'Approved location',
    metadata: {
      attendanceId: record.id,
      method:       record.checkInMethod,
      locationId,
      faceVerified: true,
      faceMethod:   method,
    },
  });

  logger.info('Check-in recorded', {
    userId,
    attendanceId: record.id,
    faceMethod:   method,
    similarity:   facePayload.sim,
    location:     locationId,
  });

  res.status(201).json({ message: 'Checked in successfully.', record });
});

// ─── POST /api/checkout ───────────────────────────────────────────────────────
const checkOut = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { faceToken } = req.body || {};

  // 1. Validate face verification token
  const facePayload = requireFaceToken(faceToken, userId, 'checkout');

  // 2. Find active session
  const active = await getActiveSession(userId);
  if (!active) {
    throw AppError.badRequest('No active session found. Please check in first.');
  }

  // 3. Update attendance record with check-out time + face verification data
  const method = facePayload.sim >= 0.999 ? 'web_password' : 'face_recognition';
  const record = await updateCheckOut(active.id, active.checkInTime, {
    faceVerified:       true,
    faceSimilarity:     facePayload.sim,
    verificationMethod: method,
  });

  // 4. Activity log
  await activity.record({
    userId,
    type:        'check_out',
    title:       'Checked out',
    description: `${record.totalDuration ?? 0} min session`,
    metadata: {
      attendanceId:  record.id,
      durationMinutes: record.totalDuration,
      faceVerified:  true,
      faceMethod:    method,
    },
  });

  logger.info('Check-out recorded', {
    userId,
    attendanceId: record.id,
    durationMin:  record.totalDuration,
    faceMethod:   method,
  });

  res.json({ message: 'Checked out successfully.', record });
});

// ─── GET /api/attendance/daily ─────────────────────────────────────────────────
const getAttendanceDaily = asyncHandler(async (req, res) => {
  const records = await getUserAttendance(req.user.id);
  res.json({ days: buildDailySummaries(records) });
});

// ─── GET /api/attendance ──────────────────────────────────────────────────────
const getAttendance = asyncHandler(async (req, res) => {
  const records = await getUserAttendance(req.user.id);
  res.json({ records });
});

// ─── GET /api/status ──────────────────────────────────────────────────────────
const getStatus = asyncHandler(async (req, res) => {
  const active = await getActiveSession(req.user.id);
  res.json({ isCheckedIn: !!active, activeSession: active || null });
});

// ─── POST /api/auto-checkout ─────────────────────────────────────────────────
// System-triggered checkout (WiFi disconnect or GPS out-of-range). No faceToken.
const autoCheckOut = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { reason = 'auto' } = req.body || {};

  const active = await getActiveSession(userId);
  if (!active) {
    return res.json({ message: 'No active session.' });
  }

  const record = await updateCheckOut(active.id, active.checkInTime, {
    faceVerified:       false,
    faceSimilarity:     null,
    verificationMethod: 'auto_checkout',
  });

  await activity.record({
    userId,
    type:        'check_out',
    title:       'Auto checked out',
    description: `${record.totalDuration ?? 0} min session (${reason})`,
    metadata: {
      attendanceId:    record.id,
      durationMinutes: record.totalDuration,
      reason,
      autoCheckout:    true,
    },
  });

  logger.info('Auto check-out recorded', { userId, reason, attendanceId: record.id });
  res.json({ message: 'Auto checkout complete.', record });
});

module.exports = { checkIn, checkOut, autoCheckOut, getAttendanceDaily, getAttendance, getStatus };
