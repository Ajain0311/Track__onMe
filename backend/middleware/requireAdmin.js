// middleware/requireAdmin.js
// Ensures the authenticated user has the 'admin' role.
// Must be used AFTER verifyToken.

const { supabase } = require('../services/supabase');

const requireAdmin = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!data || data.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required.' });
    }

    req.user.role = 'admin';
    next();
  } catch (err) {
    console.error('[requireAdmin]', err.message);
    return res.status(500).json({ error: 'Role check failed.' });
  }
};

module.exports = { requireAdmin };
