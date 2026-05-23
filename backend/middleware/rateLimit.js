// middleware/rateLimit.js — in-memory sliding-window rate limiter (no Redis dep).
// For production behind a load balancer with multiple instances, swap for redis/upstash.

const AppError = require('../utils/AppError');

const buckets = new Map();
const KEY_TTL_MS = 60 * 60 * 1000; // 1h cleanup
let lastSweep = Date.now();

const sweep = () => {
  if (Date.now() - lastSweep < KEY_TTL_MS) return;
  for (const [k, v] of buckets) if (Date.now() - v.last > KEY_TTL_MS) buckets.delete(k);
  lastSweep = Date.now();
};

// windowMs, max: classic sliding-window-counter
const rateLimit = ({ windowMs = 60_000, max = 60, key = (req) => req.ip } = {}) =>
  (req, _res, next) => {
    sweep();
    const k = key(req);
    const now = Date.now();
    const cutoff = now - windowMs;
    const arr = (buckets.get(k)?.hits ?? []).filter((t) => t > cutoff);
    arr.push(now);
    buckets.set(k, { hits: arr, last: now });
    if (arr.length > max) {
      return next(new AppError('Too many requests, please slow down.', 429, 'rate_limited'));
    }
    next();
  };

module.exports = rateLimit;
