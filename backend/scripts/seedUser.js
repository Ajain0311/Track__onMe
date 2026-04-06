/**
 * Creates a test Firebase Auth user (run once for local testing).
 * Usage: npm run seed:user
 *
 * Sign in from the app with the EMAIL shown below (Firebase Auth is email/password).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { admin } = require('../services/firebase');

const EMAIL = 'adityajain@example.com';
const PASSWORD = 'Admin@123';
const DISPLAY_NAME = 'adityajain';

async function main() {
  try {
    let user;
    try {
      user = await admin.auth().getUserByEmail(EMAIL);
      console.log(`User already exists: ${user.uid}`);
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
      user = await admin.auth().createUser({
        email: EMAIL,
        password: PASSWORD,
        displayName: DISPLAY_NAME,
        emailVerified: true,
      });
      console.log(`Created user: ${user.uid}`);
    }
    console.log('\n--- Local test login ---');
    console.log(`Email (use this in the app): ${EMAIL}`);
    console.log(`Password: ${PASSWORD}`);
    console.log(`Display name: ${DISPLAY_NAME}`);
    console.log('------------------------\n');
    process.exit(0);
  } catch (err) {
    console.error('seedUser failed:', err.message);
    if (err.code === 'auth/configuration-not-found') {
      console.error(
        '\nFirebase Authentication is not enabled for this project, or APIs are off.\n' +
          'Option A — Production: enable Auth + Firestore in Firebase Console, then run again.\n' +
          'Option B — Local emulators: set USE_FIREBASE_EMULATOR=true in backend/.env, run\n' +
          '  npx firebase emulators:start --only auth,firestore\n' +
          '  from the repo root, then npm run seed:user again.\n'
      );
    }
    process.exit(1);
  }
}

main();
