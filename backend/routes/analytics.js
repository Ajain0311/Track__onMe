// routes/analytics.js — Personal analytics (user-facing)

const express = require('express');
const router  = express.Router();

const { verifyToken }   = require('../middleware/auth');
const { getMyAnalytics } = require('../controllers/analyticsController');

router.get('/summary', verifyToken, getMyAnalytics);

module.exports = router;
