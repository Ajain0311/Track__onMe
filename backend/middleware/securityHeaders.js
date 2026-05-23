// middleware/securityHeaders.js — minimal Helmet-style header set, zero deps.
// Pure JSON API: no HTML, so CSP is intentionally not enforced here (would
// only matter if we ever served HTML from the backend).

module.exports = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  res.removeHeader('X-Powered-By');
  next();
};
