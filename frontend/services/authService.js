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
