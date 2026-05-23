// services/authService.js
// Supabase Authentication: sign in, sign up, sign out, access token retrieval.

import { supabase } from './supabaseConfig';

/**
 * Sign in existing user with email & password.
 */
export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
};

/**
 * Register a new user with email & password.
 */
export const signUp = async (email, password) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
};

/**
 * Sign out the current user.
 */
export const logOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

/**
 * Send a password-reset email. Supabase emails a magic link that, when
 * clicked, signs the user in via a one-time token. On web we redirect to
 * the current origin which Supabase will append the auth tokens to;
 * the app's existing onAuthStateChange picks up the new session.
 */
export const sendPasswordReset = async (email) => {
  const redirectTo = typeof window !== 'undefined' && window.location
    ? window.location.origin
    : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
  if (error) throw error;
};

/**
 * Get the current user's Supabase access token (JWT).
 * This is sent as a Bearer token to the backend.
 */
export const getIdToken = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new Error('No authenticated user found. Please sign in again.');
  }
  return data.session.access_token;
};
