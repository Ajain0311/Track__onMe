// routes/analytics.js — Personal analytics (user-facing)

const express = require('express');
const router  = express.Router();

const { verifyToken }        = require('../middleware/auth');
const { getMyAnalytics }     = require('../controllers/analyticsController');
const { getMyPunctuality }   = require('../controllers/punctualityController');

router.get('/summary',     verifyToken, getMyAnalytics);
router.get('/punctuality', verifyToken, getMyPunctuality);

module.exports = router;
