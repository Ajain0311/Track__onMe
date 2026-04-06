/**
 * Verifies Firebase Auth + Firestore are reachable with your Admin credentials.
 * Usage: npm run check:firebase
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { admin, db } = require('../services/firebase');

async function main() {
  console.log('Checking Firebase (production APIs, not emulators)...\n');
  try {
    await admin.auth().listUsers(1);
    console.log('Auth API: OK');
  } catch (e) {
    if (e.code === 'auth/configuration-not-found') {
      console.error(
        'Auth API: FAILED — Firebase Authentication is not enabled for this project.\n' +
          '  Fix: https://console.firebase.google.com/ → your project → Build → Authentication → Get started\n' +
          '  Then enable Email/Password under Sign-in method.\n'
      );
    } else {
      console.error('Auth API: FAILED —', e.code || e.message);
    }
  }

  try {
    await db.collection('_health_check').limit(1).get();
    console.log('Firestore API: OK');
  } catch (e) {
    if (String(e.message || '').includes('PERMISSION_DENIED') || e.code === 7) {
      console.error(
        'Firestore API: FAILED — Cloud Firestore API is disabled or Firestore not created.\n' +
          '  Fix: https://console.firebase.google.com/ → your project → Build → Firestore → Create database\n' +
          '  Also enable: https://console.developers.google.com/apis/library/firestore.googleapis.com\n'
      );
    } else {
      console.error('Firestore API: FAILED —', e.code || e.message);
    }
  }

  process.exit(0);
}

main();
