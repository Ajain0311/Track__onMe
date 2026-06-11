// routes/designations.js — public read

const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const { listActive }  = require('../controllers/designationController');

router.get('/', verifyToken, listActive);

module.exports = router;
