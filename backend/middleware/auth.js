// middleware/auth.js — verifies Supabase JWT from Authorization header

const { supabase } = require('../services/supabase');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const verifyToken = async (req, _res, next) => {
  const header = req.headers.authorization;
  // Allow token via query param for native file downloads (CSV exports)
  // This is intentionally scoped — only used when header auth is absent
  const queryToken = req.query?.token;
  if (!header || !header.startsWith('Bearer ')) {
    if (!queryToken) return next(AppError.unauthorized('No token provided.'));
  }
  const token = (header && header.startsWith('Bearer ')) ? header.slice(7) : queryToken;

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      logger.warn('Token verification failed', { error: error?.message });
      return next(AppError.unauthorized('Invalid or expired token.'));
    }
    req.user = { id: user.id, email: user.email };
    next();
  } catch (err) {
    logger.error('Auth middleware error', { error: err.message });
    next(AppError.unauthorized('Token verification error.'));
  }
};

module.exports = { verifyToken };
