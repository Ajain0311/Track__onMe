// routes/admin.js — protected by verifyToken + requireRole

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { validate, UUID_RE } = require('../middleware/validate');
const {
  getStats, listUsers, getUserAttendance, updateUserRole, listAuditLogs,
} = require('../controllers/adminController');
const {
  listAll, getOne, create, update, toggleActive, remove,
} = require('../controllers/locationController');
const {
  listAllRequests, approve, reject,
} = require('../controllers/locationRequestController');

// All admin routes require authentication + admin (or manager / super_admin) role
router.use(verifyToken, requireRole(['admin', 'manager']));

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/stats', getStats);

// ─── Users ────────────────────────────────────────────────────────────────────
router.get('/users', listUsers);
router.get('/users/:userId/attendance',
  validate({ params: { userId: { type: 'uuid', required: true } } }),
  getUserAttendance,
);
router.patch('/users/:userId/role',
  validate({
    params: { userId: { type: 'uuid', required: true } },
    body:   { role:   { type: 'string', required: true, enum: ['admin', 'user', 'manager'] } },
  }),
  updateUserRole,
);

// ─── Locations ────────────────────────────────────────────────────────────────
const locationBodySchema = {
  name:         { type: 'string', required: true, min: 1, max: 200 },
  address:      { type: 'string', max: 500 },
  latitude:     { type: 'number', required: true, min: -90,  max: 90  },
  longitude:    { type: 'number', required: true, min: -180, max: 180 },
  radiusMeters: { type: 'number', min: 10, max: 5000 },
  wifiSsids:    { type: 'array' },
  isActive:     { type: 'boolean' },
};

router.get('/locations',          listAll);
router.get('/locations/:id',      validate({ params: { id: { type: 'uuid', required: true } } }), getOne);
router.post('/locations',         validate({ body: locationBodySchema }), create);
router.put('/locations/:id',      validate({ params: { id: { type: 'uuid', required: true } } }), update);
router.patch('/locations/:id/toggle', validate({ params: { id: { type: 'uuid', required: true } } }), toggleActive);
router.delete('/locations/:id',   validate({ params: { id: { type: 'uuid', required: true } } }), remove);

// ─── Location Requests ────────────────────────────────────────────────────────
router.get('/location-requests', listAllRequests);
router.patch('/location-requests/:id/approve',
  validate({ params: { id: { type: 'uuid', required: true } } }),
  approve,
);
router.patch('/location-requests/:id/reject',
  validate({ params: { id: { type: 'uuid', required: true } } }),
  reject,
);

// ─── Audit Logs ───────────────────────────────────────────────────────────────
router.get('/audit-logs', listAuditLogs);

module.exports = router;
