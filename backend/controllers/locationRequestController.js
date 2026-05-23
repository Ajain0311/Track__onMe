// controllers/locationRequestController.js

const {
  getUserRequests,
  getUserRequest,
  createRequest,
  cancelRequest,
  getAllRequests,
  approveRequest,
  rejectRequest,
  getPendingCount,
} = require('../services/locationRequestService');

// ── User-facing ────────────────────────────────────────────────────────────

/** GET /api/location-requests — user's own requests */
const listMyRequests = async (req, res, next) => {
  try {
    const requests = await getUserRequests(req.user.id);
    return res.status(200).json({ requests });
  } catch (err) { next(err); }
};

/** POST /api/location-requests — submit a new request */
const submitRequest = async (req, res, next) => {
  try {
    const { name, address, latitude, longitude, radiusMeters, wifiSsids, notes } = req.body;
    if (!name || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'name, latitude, and longitude are required.' });
    }
    const request = await createRequest(req.user.id, {
      name, address, latitude, longitude, radiusMeters, wifiSsids, notes,
    });
    console.log(`[LocationRequest] Submitted by ${req.user.email}: "${name}"`);
    return res.status(201).json({ request });
  } catch (err) { next(err); }
};

/** DELETE /api/location-requests/:id — cancel a pending request */
const cancelMyRequest = async (req, res, next) => {
  try {
    await cancelRequest(req.params.id, req.user.id);
    return res.status(200).json({ message: 'Request cancelled.' });
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('pending')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

// ── Admin-facing ───────────────────────────────────────────────────────────

/** GET /api/admin/location-requests?status=pending|approved|rejected|all */
const listAllRequests = async (req, res, next) => {
  try {
    const { status } = req.query;
    const allowed = ['pending', 'approved', 'rejected'];
    const filter = allowed.includes(status) ? status : null;
    const requests = await getAllRequests(filter);
    const pendingCount = await getPendingCount();
    return res.status(200).json({ requests, pendingCount });
  } catch (err) { next(err); }
};

/** PATCH /api/admin/location-requests/:id/approve */
const approve = async (req, res, next) => {
  try {
    const { adminNote } = req.body;
    const result = await approveRequest(req.params.id, req.user.id, adminNote || null);
    console.log(`[LocationRequest] Approved by ${req.user.email}: request ${req.params.id}`);
    return res.status(200).json({ message: 'Request approved and location created.', ...result });
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('not pending')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

/** PATCH /api/admin/location-requests/:id/reject */
const reject = async (req, res, next) => {
  try {
    const { adminNote } = req.body;
    const request = await rejectRequest(req.params.id, req.user.id, adminNote || null);
    console.log(`[LocationRequest] Rejected by ${req.user.email}: request ${req.params.id}`);
    return res.status(200).json({ message: 'Request rejected.', request });
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('not pending')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
};

module.exports = {
  listMyRequests,
  submitRequest,
  cancelMyRequest,
  listAllRequests,
  approve,
  reject,
};
