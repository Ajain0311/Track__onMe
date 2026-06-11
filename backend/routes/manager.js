// routes/manager.js — Manager-level routes (role: admin or manager)

const express = require('express');
const router  = express.Router();
const { verifyToken }   = require('../middleware/auth');
const { requireRole }   = require('../middleware/requireRole');
const { getMyTeam }     = require('../controllers/managerController');

router.use(verifyToken, requireRole(['admin', 'manager']));

router.get('/team', getMyTeam);

module.exports = router;
