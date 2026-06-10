// routes/departments.js — user-facing: list departments + own profile

const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const { validate }    = require('../middleware/validate');
const {
  listDepartments, getMyProfile, updateMyProfile,
} = require('../controllers/departmentController');

const profileSchema = {
  displayName:  { type: 'string', max: 100 },
  phone:        { type: 'string', max: 30 },
  departmentId: { type: 'uuid' },
  designation:  { type: 'string', max: 100 },
  employeeId:   { type: 'string', max: 50 },
  joinedDate:   { type: 'string', max: 10 },
  bio:          { type: 'string', max: 500 },
};

router.get('/',         verifyToken, listDepartments);
router.get('/profile',  verifyToken, getMyProfile);
router.patch('/profile', verifyToken, validate({ body: profileSchema }), updateMyProfile);

module.exports = router;
