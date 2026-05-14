// routes/admin.js — protected by verifyToken + requireAdmin

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const { getStats, listUsers, getUserAttendance, updateUserRole } = require('../controllers/adminController');
const { listAll, getOne, create, update, toggleActive, remove } = require('../controllers/locationController');

// All admin routes require authentication + admin role
router.use(verifyToken, requireAdmin);

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/stats', getStats);

// ─── Users ────────────────────────────────────────────────────────────────────
router.get('/users', listUsers);
router.get('/users/:userId/attendance', getUserAttendance);
router.patch('/users/:userId/role', updateUserRole);

// ─── Locations ────────────────────────────────────────────────────────────────
router.get('/locations', listAll);
router.get('/locations/:id', getOne);
router.post('/locations', create);
router.put('/locations/:id', update);
router.patch('/locations/:id/toggle', toggleActive);
router.delete('/locations/:id', remove);

module.exports = router;
