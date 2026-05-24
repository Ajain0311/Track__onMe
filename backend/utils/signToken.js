// utils/signToken.js — Zero-dependency face verification token signing
// Uses Node.js built-in crypto (HMAC-SHA256). No external packages needed.
//
// Token format:  base64url(payload_json) . HMAC-SHA256(base64url(payload_json), secret)
//
// Payload: { uid, mode, sim, exp, jti }
//   uid  — Supabase user ID (string)
//   mode — 'checkin' or 'checkout'
//   sim  — similarity score (0-1) or 1.0 for web-password auth
//   exp  — expiry timestamp in ms (Date.now() + TTL)
//   jti  — unique token ID (random UUID) to help detect double-use

const crypto = require('crypto');

const SECRET = () =>
  process.env.FACE_TOKEN_SECRET || 'INSECURE_DEFAULT_CHANGE_IN_PRODUCTION';

const EXPIRY_MS = 2 * 60 * 1000; // 2-minute window (verify then immediately check in)

// Base64url helpers (RFC 4648 §5 — no padding, URL-safe chars)
const toB64u = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const fromB64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * Sign a face/web verification token.
 * @param {string} userId
 * @param {'checkin'|'checkout'} mode
 * @param {number} similarity  0–1  (use 1.0 for web-password auth)
 * @returns {string} opaque token string
 */
const signFaceToken = (userId, mode, similarity) => {
  const payload = {
    uid: userId,
    mode,
    sim: Math.round(similarity * 10000) / 10000, // 4 decimal places
    exp: Date.now() + EXPIRY_MS,
    jti: crypto.randomUUID(),
  };
  const data = toB64u(Buffer.from(JSON.stringify(payload)));
  const sig  = toB64u(crypto.createHmac('sha256', SECRET()).update(data).digest());
  return `${data}.${sig}`;
};

/**
 * Verify and decode a face verification token.
 * Throws if invalid, expired, or user/mode doesn't match.
 * @param {string} token
 * @param {string} expectedUserId
 * @param {'checkin'|'checkout'} expectedMode
 * @returns {{ uid, mode, sim, exp, jti }}
 */
const verifyFaceToken = (token, expectedUserId, expectedMode) => {
  if (!token || typeof token !== 'string') throw new Error('Missing face verification token');

  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Malformed token');

  const [data, sig] = parts;

  // Constant-time comparison to prevent timing attacks
  const expectedSig = toB64u(crypto.createHmac('sha256', SECRET()).update(data).digest());
  const sigBuf      = Buffer.from(sig);
  const expBuf      = Buffer.from(expectedSig);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid token signature');
  }

  let payload;
  try {
    payload = JSON.parse(fromB64u(data).toString('utf8'));
  } catch {
    throw new Error('Cannot decode token payload');
  }

  if (!payload.exp || Date.now() > payload.exp) {
    throw new Error('Face verification token expired — please re-verify your face');
  }
  if (payload.uid !== expectedUserId) {
    throw new Error('Token user mismatch');
  }
  if (expectedMode && payload.mode !== expectedMode) {
    throw new Error(`Token mode mismatch (got "${payload.mode}", expected "${expectedMode}")`);
  }

  return payload;
};

module.exports = { signFaceToken, verifyFaceToken, EXPIRY_MS };
