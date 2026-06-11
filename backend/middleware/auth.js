// middleware/auth.js — verifies Supabase JWT from Authorization header

const { supabase } = require('../services/supabase');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const TTLCache = require('../utils/ttlCache');

// Cache verified tokens for 60 s (clamped to the JWT's own expiry) so each
// request doesn't pay a Supabase Auth round-trip. Sign-out revocation can lag
// by at most the TTL, which is an acceptable tradeoff for ~300 ms/request.
const tokenCache = new TTLCache(60_000, 2000);

/** Best-effort read of the JWT's exp claim (ms) without verifying it —
 *  verification is Supabase's job; this only clamps our cache lifetime. */
const jwtExpiryMs = (token) => {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
};

const verifyToken = async (req, _res, next) => {
  const header = req.headers.authorization;
  // Allow token via query param for native file downloads (CSV exports)
  // This is intentionally scoped — only used when header auth is absent
  const queryToken = req.query?.token;
  if (!header || !header.startsWith('Bearer ')) {
    if (!queryToken) return next(AppError.unauthorized('No token provided.'));
  }
  const token = (header && header.startsWith('Bearer ')) ? header.slice(7) : queryToken;

  const cached = tokenCache.get(token);
  if (cached) {
    req.user = { ...cached };
    return next();
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      logger.warn('Token verification failed', { error: error?.message });
      return next(AppError.unauthorized('Invalid or expired token.'));
    }
    req.user = { id: user.id, email: user.email };
    tokenCache.set(token, { id: user.id, email: user.email }, jwtExpiryMs(token));
    next();
  } catch (err) {
    logger.error('Auth middleware error', { error: err.message });
    next(AppError.unauthorized('Token verification error.'));
  }
};

module.exports = { verifyToken };
