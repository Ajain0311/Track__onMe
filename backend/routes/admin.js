// routes/admin.js — protected by verifyToken + requireRole

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { validate, UUID_RE } = require('../middleware/validate');
const {
  getStats, listUsers, getUserAttendance, updateUserRole, listAuditLogs, listActiveSessions,
} = require('../controllers/adminController');
const {
  listAll, getOne, create, update, toggleActive, remove,
} = require('../controllers/locationController');
const {
  listAllRequests, approve, reject,
} = require('../controllers/locationRequestController');
const {
  listAllAdminLeaves,
  approve: approveLeave,
  reject:  rejectLeave,
  adminSetAllowance,
  adminGetUserBalance,
} = require('../controllers/leaveController');
const {
  listAllAdminCorrections,
  approve: approveCorrection,
  reject:  rejectCorrection,
} = require('../controllers/correctionController');
const {
  adminListDepartments, adminGetDepartment,
  adminCreateDepartment, adminUpdateDepartment, adminDeleteDepartment,
  adminListProfiles, adminSetUserDepartment,
} = require('../controllers/departmentController');

// All admin routes require authentication + admin (or manager / super_admin) role
router.use(verifyToken, requireRole(['admin', 'manager']));

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/stats',           getStats);
router.get('/active-sessions', listActiveSessions);

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

// ─── Leaves ───────────────────────────────────────────────────────────────────
router.get('/leaves', listAllAdminLeaves);
router.patch('/leaves/:id/approve',
  validate({ params: { id: { type: 'uuid', required: true } } }),
  approveLeave,
);
router.patch('/leaves/:id/reject',
  validate({ params: { id: { type: 'uuid', required: true } } }),
  rejectLeave,
);

router.post('/leaves/allowances', adminSetAllowance);
router.get('/users/:userId/leave-balance',
  validate({ params: { userId: { type: 'uuid', required: true } } }),
  adminGetUserBalance,
);

// ─── Attendance Corrections ───────────────────────────────────────────────────
router.get('/corrections', listAllAdminCorrections);
router.patch('/corrections/:id/approve',
  validate({ params: { id: { type: 'uuid', required: true } } }),
  approveCorrection,
);
router.patch('/corrections/:id/reject',
  validate({ params: { id: { type: 'uuid', required: true } } }),
  rejectCorrection,
);

// ─── Departments ─────────────────────────────────────────────────────────────
const deptBodySchema = {
  name:        { type: 'string', required: true, min: 1, max: 100 },
  description: { type: 'string', max: 500 },
  color:       { type: 'string', max: 20 },
  managerId:   { type: 'uuid' },
  isActive:    { type: 'boolean' },
};
router.get('/departments',        adminListDepartments);
router.get('/departments/:id',    validate({ params: { id: { type: 'uuid', required: true } } }), adminGetDepartment);
router.post('/departments',       validate({ body: deptBodySchema }), adminCreateDepartment);
router.put('/departments/:id',    validate({ params: { id: { type: 'uuid', required: true } } }), adminUpdateDepartment);
router.delete('/departments/:id', validate({ params: { id: { type: 'uuid', required: true } } }), adminDeleteDepartment);

// ─── Employee Profiles ────────────────────────────────────────────────────────
router.get('/profiles', adminListProfiles);
router.patch('/users/:userId/department',
  validate({
    params: { userId:       { type: 'uuid', required: true } },
    body:   { departmentId: { type: 'uuid' } },
  }),
  adminSetUserDepartment,
);

// ─── Audit Logs ───────────────────────────────────────────────────────────────
router.get('/audit-logs', listAuditLogs);

module.exports = router;
