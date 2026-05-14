// controllers/adminController.js

const {
  getAllUsers,
  getUserAttendanceAdmin,
  getDashboardStats,
  setUserRole,
  getUserRole,
} = require('../services/adminService');

// GET /api/admin/stats
const getStats = async (req, res, next) => {
  try {
    const stats = await getDashboardStats();
    return res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users
const listUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = Math.min(parseInt(req.query.per_page) || 50, 200);
    const users = await getAllUsers({ page, perPage });
    return res.status(200).json({ users });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users/:userId/attendance
const getUserAttendance = async (req, res, next) => {
  try {
    const records = await getUserAttendanceAdmin(req.params.userId);
    return res.status(200).json({ records });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/users/:userId/role
const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "admin" or "user".' });
    }
    // Prevent self-demotion
    if (req.params.userId === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot remove your own admin role.' });
    }
    await setUserRole(req.params.userId, role);
    return res.status(200).json({ message: `Role updated to ${role}.` });
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats, listUsers, getUserAttendance, updateUserRole };
