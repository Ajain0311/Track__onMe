// controllers/qrController.js — QR code generation and QR check-in/out

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { generateLocationQrToken, verifyLocationQrToken, QR_TTL_SECONDS } = require('../services/qrService');
const { createCheckIn, getActiveSession, updateCheckOut } = require('../services/attendanceService');
const { supabase } = require('../services/supabase');
const audit = require('../services/auditService');

// GET /api/admin/locations/:id/qr
// Generate a fresh QR token for a location (admin/manager only)
const generateLocationQr = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: loc, error } = await supabase
    .from('locations')
    .select('id, name, is_active')
    .eq('id', id)
    .maybeSingle();

  if (error || !loc) throw AppError.notFound('Location not found.');
  if (!loc.is_active) throw AppError.badRequest('Location is inactive. Activate it before generating QR.');

  const token = generateLocationQrToken(loc.id, loc.name);
  const expiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000).toISOString();

  res.json({ token, locationId: loc.id, locationName: loc.name, expiresAt, ttlSeconds: QR_TTL_SECONDS });
});

// POST /api/qr-checkin
// Authenticated user checks in or out using a QR token (no face token required)
const qrCheckIn = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) throw AppError.badRequest('QR token is required.');

  let locationId, locationName;
  try {
    ({ locationId, locationName } = verifyLocationQrToken(token));
  } catch (err) {
    throw AppError.badRequest(err.message);
  }

  const userId = req.user.id;
  const active = await getActiveSession(userId);

  if (active) {
    // Check-out flow
    const record = await updateCheckOut(active.id, active.checkInTime, null);

    await audit.record({
      actor: req.user, action: 'attendance.qr_checkout', resource: 'attendance',
      resourceId: record.id, metadata: { locationId, locationName, method: 'qr' }, req,
    });

    const durationMin = record.totalDuration || 0;
    const h = Math.floor(durationMin / 60), m = durationMin % 60;
    return res.json({
      action: 'checkout',
      message: `Checked out successfully. Duration: ${h}h ${m}m`,
      record,
    });
  }

  // Check-in flow
  const location = { locationId, locationName };
  const record = await createCheckIn(userId, location, { faceVerified: false, verificationMethod: 'qr' });

  await audit.record({
    actor: req.user, action: 'attendance.qr_checkin', resource: 'attendance',
    resourceId: record.id, metadata: { locationId, locationName, method: 'qr' }, req,
  });

  res.json({
    action: 'checkin',
    message: `Checked in at ${locationName || 'QR Location'}`,
    record,
  });
});

module.exports = { generateLocationQr, qrCheckIn };
