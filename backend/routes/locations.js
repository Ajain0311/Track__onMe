// routes/locations.js — user-facing: active global + user-specific locations

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { listActive } = require('../controllers/locationController');

// GET /api/locations — returns global locations + user-specific locations
router.get('/', verifyToken, listActive);

module.exports = router;
