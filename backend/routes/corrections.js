// routes/corrections.js — user-facing attendance correction endpoints

const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const { validate }    = require('../middleware/validate');
const {
  listMyCorrections, submitCorrection, cancelMyCorrection,
} = require('../controllers/correctionController');

const submitSchema = {
  attendanceId:       { type: 'uuid',   required: true },
  originalCheckIn:    { type: 'string', required: true, min: 10 },
  originalCheckOut:   { type: 'string', min: 10 },
  proposedCheckIn:    { type: 'string', required: true, min: 10 },
  proposedCheckOut:   { type: 'string', min: 10 },
  reason:             { type: 'string', required: true, min: 10, max: 1000 },
};

router.get('/',       verifyToken, listMyCorrections);
router.post('/',      verifyToken, validate({ body: submitSchema }), submitCorrection);
router.delete('/:id', verifyToken, validate({ params: { id: { type: 'uuid', required: true } } }), cancelMyCorrection);

module.exports = router;
