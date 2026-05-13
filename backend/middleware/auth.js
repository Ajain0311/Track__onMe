// middleware/auth.js
// Verifies the Supabase JWT sent in the Authorization header.
// Attaches the decoded user (id, email) to req.user.

const { supabase } = require('../services/supabase');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided.' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('[Auth] Token verification failed:', error?.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
    }

    req.user = { id: user.id, email: user.email };
    next();
  } catch (err) {
    console.error('[Auth] Unexpected error:', err.message);
    return res.status(401).json({ error: 'Unauthorized: Token verification error.' });
  }
};

module.exports = { verifyToken };
