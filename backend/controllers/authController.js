// controllers/authController.js — public signup endpoint.
//
// Supabase email confirmation is ON for this project but no SMTP is
// configured, so confirmation emails never arrive and self-served
// auth.signUp() accounts can never sign in. Signup therefore goes through
// the backend, which creates the account pre-confirmed with the admin API
// and provisions the role + profile rows in the same step.

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { supabase } = require('../services/supabase');
const logger = require('../utils/logger');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/signup  { email, password, displayName? }
const signup = asyncHandler(async (req, res) => {
  const { email, password, displayName } = req.body || {};

  if (!email || !EMAIL_RE.test(String(email).trim())) {
    throw AppError.badRequest('Enter a valid email address.');
  }
  if (!password || String(password).length < 8) {
    throw AppError.badRequest('Password must be at least 8 characters.');
  }
  if (displayName && String(displayName).length > 100) {
    throw AppError.badRequest('Name is too long.');
  }

  const cleanEmail = String(email).trim().toLowerCase();

  const { data, error } = await supabase.auth.admin.createUser({
    email: cleanEmail,
    password: String(password),
    email_confirm: true, // backend-mediated signup — no confirmation mail needed
  });

  if (error) {
    if (/already.*registered|already.*exists/i.test(error.message)) {
      throw AppError.badRequest('This email is already registered — try signing in.');
    }
    logger.warn('[signup] createUser failed', { error: error.message });
    throw AppError.badRequest(error.message);
  }

  const userId = data.user.id;

  // Provision default role + profile. Failures here shouldn't orphan the
  // account — role lookups default to "user" anyway — but log them.
  const { error: roleErr } = await supabase
    .from('user_roles')
    .upsert({ user_id: userId, role: 'user' }, { onConflict: 'user_id' });
  if (roleErr) logger.warn('[signup] role row failed', { error: roleErr.message });

  if (displayName) {
    const { error: profErr } = await supabase
      .from('employee_profiles')
      .upsert({ user_id: userId, display_name: String(displayName).trim() }, { onConflict: 'user_id' });
    if (profErr) logger.warn('[signup] profile row failed', { error: profErr.message });
  }

  logger.info('[signup] account created', { email: cleanEmail });
  res.status(201).json({ success: true, message: 'Account created — you can sign in now.' });
});

module.exports = { signup };
