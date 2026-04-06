// middleware/auth.js
// Verifies the Firebase ID token sent in the Authorization header.
// Attaches the decoded UID to req.user.

const { admin } = require('../services/firebase');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided.' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = { uid: decodedToken.uid, email: decodedToken.email };
    next();
  } catch (error) {
    console.error('[Auth] Token verification failed:', error.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
  }
};

module.exports = { verifyToken };
