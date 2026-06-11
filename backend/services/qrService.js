// services/qrService.js — signed QR tokens for location-based check-in

const crypto = require('crypto');

const QR_TTL_SECONDS = 5 * 60; // 5-minute window

// Use SUPABASE_SERVICE_KEY as signing secret (already set on Render).
// Set QR_SECRET env var to override with a dedicated key.
const getSecret = () => {
  const raw = process.env.QR_SECRET || process.env.SUPABASE_SERVICE_KEY || '';
  if (!raw) throw new Error('No QR signing secret configured.');
  return raw.slice(0, 32).padEnd(32, '0');
};

const sign = (payload) =>
  crypto.createHmac('sha256', getSecret()).update(payload).digest('hex').slice(0, 16);

/**
 * Build a base64url-encoded, HMAC-signed token for a location.
 * Token is valid for QR_TTL_SECONDS.
 */
const generateLocationQrToken = (locationId, locationName) => {
  const t   = Math.floor(Date.now() / 1000);
  const exp = t + QR_TTL_SECONDS;
  const sig = sign(`${locationId}|${t}|${exp}`);
  const payload = JSON.stringify({ v: 1, lid: locationId, ln: locationName || '', t, exp, sig });
  return Buffer.from(payload).toString('base64url');
};

/**
 * Verify a QR token and return { locationId, locationName }.
 * Throws a descriptive error on any failure.
 */
const verifyLocationQrToken = (token) => {
  let data;
  try {
    data = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid QR code. Please scan a valid AttendTrack QR.');
  }

  const { v, lid, ln, t, exp, sig } = data;
  if (v !== 1 || !lid || !t || !exp || !sig) throw new Error('Malformed QR token.');

  const now = Math.floor(Date.now() / 1000);
  if (now > exp) throw new Error('QR code has expired. Ask your admin to refresh it.');

  const expected = sign(`${lid}|${t}|${exp}`);
  if (sig !== expected) throw new Error('QR code signature is invalid.');

  return { locationId: lid, locationName: ln };
};

module.exports = { generateLocationQrToken, verifyLocationQrToken, QR_TTL_SECONDS };
