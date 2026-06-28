// controllers/faceController.js — Server-side face verification (ArcFace embeddings)
//
// Routes:
//   POST   /api/face/register   — submit embeddings for manager approval (native)
//   POST   /api/face/verify     — compare embedding, issue signed token (native)
//   POST   /api/face/verify-web — server-side password re-auth, issue token (web)
//   GET    /api/face/status     — approved | pending | rejected | none
//   DELETE /api/face            — delete active face + enrollment requests
//
// The device computes the embedding on-device and uploads only the vector.
// The server is the AUTHORITY on the match and on activation: a freshly
// submitted face is INACTIVE until a manager approves it.

const { createClient } = require('@supabase/supabase-js');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { bestMatch, validateEmbeddingPayload, FACE_MATCH_THRESHOLD } = require('../utils/faceUtils');
const { signFaceToken } = require('../utils/signToken');
const faceEnrollment = require('../services/faceEnrollmentService');
const notify = require('../services/notificationService');
const logger = require('../utils/logger');

// Lazy anon-key client for web password verification (unchanged from before).
let _supabaseAnon = null;
const getAnonClient = () => {
  if (_supabaseAnon) return _supabaseAnon;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_ANON_KEY is not set in backend/.env. Add it to enable web password verification.'
    );
  }
  _supabaseAnon = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return _supabaseAnon;
};

// ─── POST /api/face/register ─────────────────────────────────────────────────
// Submits the user's enrollment embeddings for MANAGER APPROVAL. The face does
// not become usable until approved.
const registerFace = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { features } = req.body;

  // Registration enrolls multiple angles (front + slight turn) — expect ≥ 2.
  const validErr = validateEmbeddingPayload(features, { minEmbeddings: 2 });
  if (validErr) throw AppError.badRequest(`Invalid face data: ${validErr}`);

  const request = await faceEnrollment.submitEnrollment(userId, features);

  // Notify approvers (admins / managers) — fail-soft.
  try {
    const approverIds = await faceEnrollment.getApproverIds();
    await Promise.all(approverIds
      .filter((id) => id !== userId)
      .map((id) => notify.send({
        userId: id,
        type:   'face_enrollment.submitted',
        title:  'New face enrollment to review',
        body:   `${req.user.email || 'A user'} submitted a face enrollment for approval.`,
        link:   '/AdminFaceEnrollments',
        metadata: { requestId: request.id, subjectUserId: userId },
      })));
  } catch (err) {
    logger.warn('Face enrollment approver notification failed', { error: err.message });
  }

  logger.info('Face enrollment submitted (pending approval)', { userId, samples: request.sampleCount });
  res.json({
    success: true,
    status:  'pending',
    message: 'Face submitted. A manager must approve it before you can check in.',
  });
});

// ─── POST /api/face/verify — native face verification ────────────────────────
const verifyFace = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { features, mode } = req.body;

  if (!mode || !['checkin', 'checkout'].includes(mode)) {
    throw AppError.badRequest('mode must be "checkin" or "checkout"');
  }

  // Verification submits a single live probe embedding.
  const validErr = validateEmbeddingPayload(features, { minEmbeddings: 1 });
  if (validErr) throw AppError.badRequest(`Invalid submitted face data: ${validErr}`);

  const active = await faceEnrollment.getActiveEnrollment(userId);

  if (active?.migrationPending) {
    throw AppError.internal(
      'Face verification is not configured yet. Ask your administrator to apply database migration 005.'
    );
  }

  if (!active) {
    // Distinguish "awaiting approval" from "never enrolled" for a clear message.
    const status = await faceEnrollment.getStatusForUser(userId);
    if (status.status === 'pending') {
      throw AppError.forbidden('Your face enrollment is awaiting manager approval. Please try again once approved.');
    }
    if (status.status === 'rejected') {
      throw AppError.forbidden('Your face enrollment was rejected. Please re-register your face in Settings.');
    }
    throw AppError.badRequest('Your face is not registered. Open Settings → Register Face to enroll.');
  }

  const storedErr = validateEmbeddingPayload(active.features, { minEmbeddings: 1 });
  if (storedErr) {
    logger.warn('Corrupted stored face data', { userId, error: storedErr });
    throw AppError.badRequest('Your stored face data appears corrupted. Please re-register your face in Settings.');
  }

  const probe = features.embeddings[0];
  const similarity = bestMatch(active.features.embeddings, probe);

  logger.info('Face verification attempt', {
    userId,
    similarity: similarity.toFixed(4),
    threshold:  FACE_MATCH_THRESHOLD.toFixed(4),
    mode,
    pass: similarity >= FACE_MATCH_THRESHOLD,
  });

  if (similarity < FACE_MATCH_THRESHOLD) {
    throw AppError.forbidden(
      'Face verification failed — not a confident match. ' +
      'Ensure good lighting, look straight at the camera, and try again.'
    );
  }

  const token = signFaceToken(userId, mode, similarity);
  res.json({ success: true, token, similarity, message: 'Face verified.' });
});

// ─── POST /api/face/verify-web — web second-factor via password (UNCHANGED) ──
const verifyWeb = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const email  = req.user.email;
  const { password, mode } = req.body;

  if (!password || typeof password !== 'string' || password.length < 6) {
    throw AppError.badRequest('Password must be at least 6 characters.');
  }
  if (!mode || !['checkin', 'checkout'].includes(mode)) {
    throw AppError.badRequest('mode must be "checkin" or "checkout"');
  }

  let verifiedUserId;
  try {
    const anon = getAnonClient();
    const { data, error: authErr } = await anon.auth.signInWithPassword({ email, password });
    if (authErr || !data?.user) throw AppError.forbidden('Incorrect password. Please try again.');
    verifiedUserId = data.user.id;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err.message?.includes('SUPABASE_ANON_KEY')) {
      logger.error('SUPABASE_ANON_KEY not configured', { userId });
      throw AppError.internal(
        'Web password verification is not configured on this server. ' +
        'Ask your administrator to set SUPABASE_ANON_KEY in the backend environment variables.'
      );
    }
    logger.warn('Web password verification error', { userId, error: err.message });
    throw AppError.forbidden('Password verification failed. Please try again.');
  }

  if (verifiedUserId !== userId) {
    logger.error('Web verify: user ID mismatch', { expected: userId, got: verifiedUserId });
    throw AppError.forbidden('Identity mismatch — cannot verify.');
  }

  logger.info('Web password verification successful', { userId, mode });
  // sim = 1.0 signals "web password auth" in the attendance audit trail
  const token = signFaceToken(userId, mode, 1.0);
  res.json({ success: true, token, message: 'Identity confirmed via password.' });
});

// ─── GET /api/face/status ─────────────────────────────────────────────────────
const getFaceStatus = asyncHandler(async (req, res) => {
  const status = await faceEnrollment.getStatusForUser(req.user.id);
  res.json({
    registered: status.status === 'approved',
    ...status,
  });
});

// ─── DELETE /api/face ─────────────────────────────────────────────────────────
const deleteFace = asyncHandler(async (req, res) => {
  await faceEnrollment.purgeForUser(req.user.id);
  logger.info('Face data deleted', { userId: req.user.id });
  res.json({ success: true, message: 'Face data deleted from server.' });
});

module.exports = { registerFace, verifyFace, verifyWeb, getFaceStatus, deleteFace };
