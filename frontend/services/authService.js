// services/authService.js
// Handles Firebase Authentication: sign in, sign up, sign out, token retrieval.

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from './firebaseConfig';

/**
 * Sign in existing user with email & password.
 */
export const signIn = async (email, password) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
};

/**
 * Register new user with email & password.
 */
export const signUp = async (email, password) => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  return userCredential.user;
};

/**
 * Sign out the current user.
 */
export const logOut = async () => {
  await signOut(auth);
};

/**
 * Get the current user's Firebase ID token.
 * Pass forceRefresh=true to always fetch a fresh token.
 */
export const getIdToken = async (forceRefresh = false) => {
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user found.');
  return await user.getIdToken(forceRefresh);
};
