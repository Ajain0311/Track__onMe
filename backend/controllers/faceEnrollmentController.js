// controllers/faceEnrollmentController.js — admin/manager review of face enrollments.
// Mirrors locationRequestController.js (approve/reject + audit + notify).

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const faceEnrollment = require('../services/faceEnrollmentService');
const audit = require('../services/auditService');
const notify = require('../services/notificationService');

// GET /api/admin/face-enrollments?status=pending|approved|rejected
const listEnrollments = asyncHandler(async (req, res) => {
  const allowed = ['pending', 'approved', 'rejected'];
  const filter = allowed.includes(req.query.status) ? req.query.status : null;
  const [requests, pendingCount] = await Promise.all([
    faceEnrollment.listAll(filter),
    faceEnrollment.getPendingCount(),
  ]);
  res.json({ requests, pendingCount });
});

// PATCH /api/admin/face-enrollments/:id/approve
const approve = asyncHandler(async (req, res) => {
  try {
    const result = await faceEnrollment.approve(req.params.id, req.user.id, req.body?.adminNote || null);
    await audit.record({
      actor: req.user, action: 'face_enrollment.approve', resource: 'face_enrollment_requests',
      resourceId: req.params.id, metadata: { subjectUserId: result.userId }, req,
    });
    await notify.send({
      userId: result.userId, type: 'face_enrollment.approved',
      title: 'Face enrollment approved',
      body: 'Your face has been approved. You can now check in with face verification.',
      link: '/Settings',
    });
    res.json({ message: 'Face enrollment approved.', ...result });
  } catch (err) {
    if (/not found|not pending/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

// PATCH /api/admin/face-enrollments/:id/reject
const reject = asyncHandler(async (req, res) => {
  try {
    const result = await faceEnrollment.reject(req.params.id, req.user.id, req.body?.adminNote || null);
    await audit.record({
      actor: req.user, action: 'face_enrollment.reject', resource: 'face_enrollment_requests',
      resourceId: req.params.id, metadata: { adminNote: req.body?.adminNote }, req,
    });
    await notify.send({
      userId: result.userId, type: 'face_enrollment.rejected',
      title: 'Face enrollment rejected',
      body: req.body?.adminNote || 'Your face enrollment was rejected. Please re-register your face.',
      link: '/FaceRegistration',
    });
    res.json({ message: 'Face enrollment rejected.', ...result });
  } catch (err) {
    if (/not found|not pending/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

module.exports = { listEnrollments, approve, reject };
