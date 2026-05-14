// routes/locations.js — user-facing: get active locations for picker

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { listActive } = require('../controllers/locationController');

router.get('/', verifyToken, listActive);

module.exports = router;
