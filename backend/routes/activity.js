// routes/activity.js

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { listMine } = require('../controllers/activityController');

router.get('/', verifyToken, listMine);

module.exports = router;
