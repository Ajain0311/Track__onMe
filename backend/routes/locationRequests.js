// routes/locationRequests.js — user-facing location request endpoints

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  listMyRequests, submitRequest, cancelMyRequest,
} = require('../controllers/locationRequestController');

const submitSchema = {
  name:         { type: 'string', required: true, min: 1, max: 200 },
  address:      { type: 'string', max: 500 },
  latitude:     { type: 'number', required: true, min: -90,  max: 90  },
  longitude:    { type: 'number', required: true, min: -180, max: 180 },
  accuracy:     { type: 'number', min: 0 },
  capturedAt:   { type: 'string', max: 64 },
  radiusMeters: { type: 'number', min: 10, max: 5000 },
  wifiSsids:    { type: 'array' },
  notes:        { type: 'string', max: 1000 },
};

router.get('/',       verifyToken, listMyRequests);
router.post('/',      verifyToken, validate({ body: submitSchema }), submitRequest);
router.delete('/:id', verifyToken, validate({ params: { id: { type: 'uuid', required: true } } }), cancelMyRequest);

module.exports = router;
