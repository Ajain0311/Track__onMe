// routes/shifts.js — public (authenticated) shift read + admin write

const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { getActiveShifts } = require('../services/shiftService');
const asyncHandler = require('../middleware/asyncHandler');

// All authenticated users can read active shifts (for their profile page)
router.get('/', verifyToken, asyncHandler(async (_req, res) => {
  const shifts = await getActiveShifts();
  res.json({ shifts });
}));

module.exports = router;
