// controllers/locationRequestController.js

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const {
  getUserRequests, createRequest, cancelRequest,
  getAllRequests,  approveRequest, rejectRequest, getPendingCount,
} = require('../services/locationRequestService');
const audit = require('../services/auditService');
const activity = require('../services/activityService');
const notify = require('../services/notificationService');

// ─── User-facing ──────────────────────────────────────────────────────────

const listMyRequests = asyncHandler(async (req, res) => {
  const requests = await getUserRequests(req.user.id);
  res.json({ requests });
});

const submitRequest = asyncHandler(async (req, res) => {
  const request = await createRequest(req.user.id, req.body);
  await activity.record({
    userId: req.user.id, type: 'location_request.submitted',
    title: `Location request submitted: ${request.name}`,
    metadata: { requestId: request.id },
  });
  res.status(201).json({ request });
});

const cancelMyRequest = asyncHandler(async (req, res) => {
  try {
    await cancelRequest(req.params.id, req.user.id);
    await activity.record({
      userId: req.user.id, type: 'location_request.cancelled',
      title: 'Location request cancelled', metadata: { requestId: req.params.id },
    });
    res.json({ message: 'Request cancelled.' });
  } catch (err) {
    if (/not found|pending/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

// ─── Admin-facing ─────────────────────────────────────────────────────────

const listAllRequests = asyncHandler(async (req, res) => {
  const allowed = ['pending', 'approved', 'rejected'];
  const filter = allowed.includes(req.query.status) ? req.query.status : null;
  const [requests, pendingCount] = await Promise.all([
    getAllRequests(filter), getPendingCount(),
  ]);
  res.json({ requests, pendingCount });
});

const approve = asyncHandler(async (req, res) => {
  try {
    const result = await approveRequest(req.params.id, req.user.id, req.body?.adminNote || null);
    await audit.record({
      actor: req.user, action: 'location_request.approve', resource: 'location_requests',
      resourceId: req.params.id, metadata: { locationId: result.locationId }, req,
    });
    await notify.send({
      userId: result.request.userId, type: 'location_request.approved',
      title: 'Location request approved',
      body: `Your request "${result.request.name}" has been approved.`,
      link: '/MyLocationRequests',
    });
    res.json({ message: 'Request approved and location created.', ...result });
  } catch (err) {
    if (/not found|not pending/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

const reject = asyncHandler(async (req, res) => {
  try {
    const request = await rejectRequest(req.params.id, req.user.id, req.body?.adminNote || null);
    await audit.record({
      actor: req.user, action: 'location_request.reject', resource: 'location_requests',
      resourceId: req.params.id, metadata: { adminNote: req.body?.adminNote }, req,
    });
    await notify.send({
      userId: request.userId, type: 'location_request.rejected',
      title: 'Location request rejected',
      body: req.body?.adminNote || `Your request "${request.name}" has been rejected.`,
      link: '/MyLocationRequests',
    });
    res.json({ message: 'Request rejected.', request });
  } catch (err) {
    if (/not found|not pending/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

module.exports = {
  listMyRequests, submitRequest, cancelMyRequest,
  listAllRequests, approve, reject,
};
