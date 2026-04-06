// services/firebaseConfig.js
// Firebase CLIENT SDK initialization for React Native (Expo).
// Uses AsyncStorage for session persistence across app restarts.

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
  connectAuthEmulator,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Default config: Web app from Firebase Console (works for Expo web + native).
// Override any field with EXPO_PUBLIC_FIREBASE_* in frontend/.env if needed.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyA875EHJmvcGmfMB23TX2c1oYi90Ga0WX8',
  authDomain:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'attendance-ba6294.firebaseapp.com',
  databaseURL:
    process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ||
    'https://attendance-ba6294-default-rtdb.firebaseio.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'attendance-ba6294',
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    'attendance-ba6294.firebasestorage.app',
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '775152459851',
  appId:
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ||
    '1:775152459851:web:4786e61bb1edb7a2f4edce',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-Q70227MHF0',
};

// Prevent duplicate app initialization on hot reload
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Native: AsyncStorage persistence. Web: default browser persistence (IndexedDB) via getAuth.
// Using getReactNativePersistence on web breaks or blocks sign-in for many setups.
let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    auth = getAuth(app);
  }
}

const useAuthEmulator =
  __DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === '1';
const defaultAuthEmuHost =
  Platform.OS === 'android' ? '10.0.2.2:9099' : '127.0.0.1:9099';
const authEmulatorHost =
  process.env.EXPO_PUBLIC_AUTH_EMULATOR_HOST || defaultAuthEmuHost;

if (useAuthEmulator) {
  try {
    connectAuthEmulator(auth, `http://${authEmulatorHost}`, { disableWarnings: true });
  } catch (e) {
    // Already connected (e.g. Fast Refresh)
  }
}

// Initialize Firestore
const db = getFirestore(app);

export { auth, db };
