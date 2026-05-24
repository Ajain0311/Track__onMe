// controllers/faceController.js — Server-side face verification
//
// Routes:
//   POST /api/face/register    — store/update face features (native only)
//   POST /api/face/verify      — compare features, issue signed token (native)
//   POST /api/face/verify-web  — server-side password re-auth, issue signed token (web)
//   GET  /api/face/status      — check if user has registered face in DB
//   DELETE /api/face           — delete face data from DB

const { createClient } = require('@supabase/supabase-js');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { supabase } = require('../services/supabase');
const { calculateSimilarity, validateFaceFeatures, SIMILARITY_THRESHOLD } = require('../utils/faceUtils');
const { signFaceToken } = require('../utils/signToken');
const logger = require('../utils/logger');

// Lazy-initialized anon-key client (for password verification only).
// The main supabase client uses the service role key which cannot call
// signInWithPassword for arbitrary users — we need the anon key for that.
let _supabaseAnon = null;
const getAnonClient = () => {
  if (_supabaseAnon) return _supabaseAnon;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_ANON_KEY is not set in backend/.env. ' +
      'Add it to enable web password verification.'
    );
  }
  _supabaseAnon = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _supabaseAnon;
};

// ─── POST /api/face/register ─────────────────────────────────────────────────
const registerFace = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { features } = req.body;

  const validErr = validateFaceFeatures(features);
  if (validErr) throw AppError.badRequest(`Invalid face data: ${validErr}`);

  const { error } = await supabase.from('user_face_data').upsert(
    {
      user_id:      userId,
      features,
      sample_count: features.sampleCount ?? 1,
      updated_at:   new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    logger.error('Face registration DB error', { userId, error: error.message });
    throw new Error(`Face registration failed: ${error.message}`);
  }

  logger.info('Face registered/updated', { userId, samples: features.sampleCount ?? 1 });
  res.json({
    success: true,
    message: 'Face data registered and stored securely.',
    sampleCount: features.sampleCount ?? 1,
  });
});

// ─── POST /api/face/verify — native face verification ────────────────────────
const verifyFace = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { features, mode } = req.body;

  if (!mode || !['checkin', 'checkout'].includes(mode)) {
    throw AppError.badRequest('mode must be "checkin" or "checkout"');
  }

  const validErr = validateFaceFeatures(features);
  if (validErr) throw AppError.badRequest(`Invalid submitted features: ${validErr}`);

  // Load stored face data from DB
  const { data: stored, error } = await supabase
    .from('user_face_data')
    .select('features, sample_count')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Table may not exist before migration 004 is applied
    if (error.message?.toLowerCase().includes('user_face_data') ||
        error.code === '42P01') {
      throw AppError.internal(
        'Face verification service is not configured yet. ' +
        'Ask your administrator to apply database migration 004.'
      );
    }
    throw new Error(`Face data query failed: ${error.message}`);
  }

  if (!stored) {
    throw AppError.badRequest(
      'Your face is not registered on the server. ' +
      'Please open Settings → Register Face to enroll your face.'
    );
  }

  const storedValidErr = validateFaceFeatures(stored.features);
  if (storedValidErr) {
    logger.warn('Corrupted stored face data', { userId, error: storedValidErr });
    throw AppError.badRequest(
      'Your stored face data appears corrupted. Please re-register your face in Settings.'
    );
  }

  const similarity = calculateSimilarity(stored.features, features);

  logger.info('Face verification attempt', {
    userId,
    similarity: `${(similarity * 100).toFixed(1)}%`,
    threshold: `${Math.round(SIMILARITY_THRESHOLD * 100)}%`,
    mode,
    pass: similarity >= SIMILARITY_THRESHOLD,
  });

  if (similarity < SIMILARITY_THRESHOLD) {
    throw AppError.forbidden(
      `Face verification failed — match: ${Math.round(similarity * 100)}% ` +
      `(need ≥ ${Math.round(SIMILARITY_THRESHOLD * 100)}%). ` +
      'Ensure good lighting and face the camera directly.'
    );
  }

  const token = signFaceToken(userId, mode, similarity);

  res.json({
    success: true,
    token,
    similarity,
    message: `Face verified (${Math.round(similarity * 100)}% match).`,
  });
});

// ─── POST /api/face/verify-web — web second-factor via password ──────────────
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

  // Verify password server-side via Supabase anon client
  let verifiedUserId;
  try {
    const anon = getAnonClient();
    const { data, error: authErr } = await anon.auth.signInWithPassword({ email, password });
    if (authErr || !data?.user) {
      throw AppError.forbidden('Incorrect password. Please try again.');
    }
    verifiedUserId = data.user.id;
  } catch (err) {
    if (err instanceof AppError) throw err;
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

  res.json({
    success: true,
    token,
    message: 'Identity confirmed via password.',
  });
});

// ─── GET /api/face/status ─────────────────────────────────────────────────────
const getFaceStatus = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('user_face_data')
    .select('user_id, sample_count, updated_at')
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (error && (error.code === '42P01' || error.message?.includes('user_face_data'))) {
    // Migration not applied yet — treat as not registered
    return res.json({ registered: false, sampleCount: 0, updatedAt: null, migrationPending: true });
  }

  res.json({
    registered:  !!data,
    sampleCount: data?.sample_count ?? 0,
    updatedAt:   data?.updated_at ?? null,
  });
});

// ─── DELETE /api/face ─────────────────────────────────────────────────────────
const deleteFace = asyncHandler(async (req, res) => {
  const { error } = await supabase
    .from('user_face_data')
    .delete()
    .eq('user_id', req.user.id);

  if (error) throw new Error(`Face data deletion failed: ${error.message}`);

  logger.info('Face data deleted', { userId: req.user.id });
  res.json({ success: true, message: 'Face data deleted from server.' });
});

module.exports = { registerFace, verifyFace, verifyWeb, getFaceStatus, deleteFace };
