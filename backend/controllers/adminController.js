// controllers/adminController.js

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const {
  getAllUsers, getUserAttendanceAdmin, getDashboardStats, setUserRole,
} = require('../services/adminService');
const audit = require('../services/auditService');

// GET /api/admin/stats
const getStats = asyncHandler(async (_req, res) => {
  const stats = await getDashboardStats();
  res.json(stats);
});

// GET /api/admin/users?page=&per_page=
const listUsers = asyncHandler(async (req, res) => {
  const page    = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = Math.min(parseInt(req.query.per_page, 10) || 50, 200);
  const users = await getAllUsers({ page, perPage });
  res.json({ users, page, perPage });
});

// GET /api/admin/users/:userId/attendance
const getUserAttendance = asyncHandler(async (req, res) => {
  const records = await getUserAttendanceAdmin(req.params.userId);
  res.json({ records });
});

// PATCH /api/admin/users/:userId/role
const updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const targetId = req.params.userId;

  if (!['admin', 'user', 'manager'].includes(role)) {
    throw AppError.badRequest('Role must be "admin", "user" or "manager".');
  }
  if (targetId === req.user.id && role !== 'admin' && req.user.role !== 'super_admin') {
    throw AppError.badRequest('You cannot demote your own admin role.');
  }

  await setUserRole(targetId, role);
  await audit.record({
    actor: req.user, action: 'user.role.update', resource: 'users',
    resourceId: targetId, metadata: { newRole: role }, req,
  });
  res.json({ message: `Role updated to ${role}.`, role });
});

// GET /api/admin/audit-logs
const listAuditLogs = asyncHandler(async (req, res) => {
  const result = await audit.list({
    page:    parseInt(req.query.page, 10) || 1,
    perPage: Math.min(parseInt(req.query.per_page, 10) || 50, 200),
    action:  req.query.action || null,
    actorId: req.query.actor_id || null,
  });
  res.json(result);
});

module.exports = { getStats, listUsers, getUserAttendance, updateUserRole, listAuditLogs };
