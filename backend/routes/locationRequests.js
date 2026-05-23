// routes/locationRequests.js — user-facing location request endpoints

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  listMyRequests,
  submitRequest,
  cancelMyRequest,
} = require('../controllers/locationRequestController');

router.get('/',        verifyToken, listMyRequests);   // GET  /api/location-requests
router.post('/',       verifyToken, submitRequest);    // POST /api/location-requests
router.delete('/:id',  verifyToken, cancelMyRequest);  // DELETE /api/location-requests/:id

module.exports = router;
