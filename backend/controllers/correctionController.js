// controllers/correctionController.js — Attendance correction handlers

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const {
  getUserCorrections, createCorrection, cancelCorrection,
  getAllCorrections, getPendingCount, approveCorrection, rejectCorrection,
} = require('../services/correctionService');
const audit    = require('../services/auditService');
const activity = require('../services/activityService');
const notify   = require('../services/notificationService');

// ─── User-facing ──────────────────────────────────────────────────────────────

const listMyCorrections = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const corrections = await getUserCorrections(req.user.id, { status });
  res.json({ corrections });
});

const submitCorrection = asyncHandler(async (req, res) => {
  const {
    attendanceId, originalCheckIn, originalCheckOut,
    proposedCheckIn, proposedCheckOut, reason,
  } = req.body;

  try {
    const correction = await createCorrection(req.user.id, {
      attendanceId, originalCheckIn, originalCheckOut,
      proposedCheckIn, proposedCheckOut, reason,
    });
    await activity.record({
      userId: req.user.id, type: 'correction.submitted',
      title: 'Attendance correction submitted',
      metadata: { correctionId: correction.id, attendanceId },
    });
    res.status(201).json({ correction });
  } catch (err) {
    if (/not found|pending|belong/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

const cancelMyCorrection = asyncHandler(async (req, res) => {
  try {
    await cancelCorrection(req.params.id, req.user.id);
    await activity.record({
      userId: req.user.id, type: 'correction.cancelled',
      title: 'Correction request cancelled',
      metadata: { correctionId: req.params.id },
    });
    res.json({ message: 'Correction request cancelled.' });
  } catch (err) {
    if (/not found|pending/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

// ─── Admin-facing ─────────────────────────────────────────────────────────────

const listAllAdminCorrections = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const [corrections, pendingCount] = await Promise.all([
    getAllCorrections({ status }),
    getPendingCount(),
  ]);
  res.json({ corrections, pendingCount });
});

const approve = asyncHandler(async (req, res) => {
  try {
    const { correction, userId } = await approveCorrection(
      req.params.id, req.user.id, req.body?.adminNote ?? null,
    );
    await audit.record({
      actor: req.user, action: 'correction.approve', resource: 'attendance_corrections',
      resourceId: req.params.id, metadata: { adminNote: req.body?.adminNote }, req,
    });
    await notify.send({
      userId, type: 'correction.approved',
      title: 'Attendance correction approved',
      body: req.body?.adminNote || 'Your attendance record has been updated.',
      link: '/History',
    });
    res.json({ message: 'Correction approved and attendance record updated.', correction });
  } catch (err) {
    if (/not found|pending|Failed/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

const reject = asyncHandler(async (req, res) => {
  try {
    const { correction, userId } = await rejectCorrection(
      req.params.id, req.user.id, req.body?.adminNote ?? null,
    );
    await audit.record({
      actor: req.user, action: 'correction.reject', resource: 'attendance_corrections',
      resourceId: req.params.id, metadata: { adminNote: req.body?.adminNote }, req,
    });
    await notify.send({
      userId, type: 'correction.rejected',
      title: 'Attendance correction rejected',
      body: req.body?.adminNote || 'Your correction request was reviewed.',
      link: '/History',
    });
    res.json({ message: 'Correction rejected.', correction });
  } catch (err) {
    if (/not found|pending/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

module.exports = {
  listMyCorrections, submitCorrection, cancelMyCorrection,
  listAllAdminCorrections, approve, reject,
};
