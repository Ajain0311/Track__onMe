// routes/leaves.js — user-facing leave endpoints

const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const { validate }    = require('../middleware/validate');
const {
  listLeaveTypes, listMyLeaves, submitLeave, cancelMyLeave, getMyLeaveBalance,
} = require('../controllers/leaveController');

const submitSchema = {
  leaveTypeId: { type: 'uuid', required: true },
  startDate:   { type: 'string', required: true, min: 10, max: 10 },
  endDate:     { type: 'string', required: true, min: 10, max: 10 },
  days:        { type: 'number', required: true, min: 1, max: 365 },
  reason:      { type: 'string', required: true, min: 10, max: 1000 },
};

router.get('/types',   verifyToken, listLeaveTypes);
router.get('/balance', verifyToken, getMyLeaveBalance);
router.get('/',       verifyToken, listMyLeaves);
router.post('/',      verifyToken, validate({ body: submitSchema }), submitLeave);
router.delete('/:id', verifyToken, validate({ params: { id: { type: 'uuid', required: true } } }), cancelMyLeave);

module.exports = router;
