// routes/holidays.js — Public (authenticated) holiday listing

const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const { listHolidays } = require('../controllers/holidayController');

router.get('/', verifyToken, listHolidays);

module.exports = router;
