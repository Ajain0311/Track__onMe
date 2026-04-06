// services/firebase.js
// Initializes the Firebase Admin SDK once using environment variables.
// Set USE_FIREBASE_EMULATOR=true in .env to use the local Auth + Firestore emulators.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const admin = require('firebase-admin');

if (process.env.USE_FIREBASE_EMULATOR === 'true') {
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST =
    process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  console.log('[Firebase] Using local emulators (Auth + Firestore).');
}

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    throw new Error(
      'Missing Firebase environment variables. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.'
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });

  console.log('[Firebase] Admin SDK initialized successfully.');
}

const db = admin.firestore();

module.exports = { admin, db };
