// routes/face.js — Face verification endpoints

const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const rateLimit        = require('../middleware/rateLimit');
const asyncHandler     = require('../utils/asyncHandler');
const AppError         = require('../utils/AppError');
const {
  registerFace, verifyFace, verifyWeb, getFaceStatus, deleteFace,
} = require('../controllers/faceController');

// Stricter limits for verification to prevent brute-force
const verifyLimiter   = rateLimit({ windowMs: 60_000, max: 10, key: (req) => req.user?.id || req.ip });
const registerLimiter = rateLimit({ windowMs: 60_000, max:  5, key: (req) => req.user?.id || req.ip });

// Inline body guards (validate middleware doesn't handle nested JSONB well)
const requireFeatures = asyncHandler(async (req, _res, next) => {
  const { features } = req.body || {};
  if (!features || features.__v !== 2 || !features.ratios) {
    throw AppError.badRequest(
      'Request body must include { features: { __v: 2, ratios: {...} } }'
    );
  }
  next();
});

router.post('/register',   verifyToken, registerLimiter, requireFeatures, registerFace);
router.post('/verify',     verifyToken, verifyLimiter,   requireFeatures, verifyFace);
router.post('/verify-web', verifyToken, verifyLimiter,   verifyWeb);
router.get('/status',      verifyToken, getFaceStatus);
router.delete('/',         verifyToken, deleteFace);

module.exports = router;
