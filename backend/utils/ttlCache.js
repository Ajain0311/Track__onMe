// utils/ttlCache.js — tiny in-memory TTL cache with size cap.
// Used to avoid repeated Supabase round-trips (Render↔Supabase RTT is ~250ms
// cross-region) for hot lookups like token verification and role checks.

class TTLCache {
  constructor(ttlMs, max = 1000) {
    this.ttl = ttlMs;
    this.max = max;
    this.map = new Map();
  }

  /** Returns cached value or undefined. Expired entries are evicted lazily. */
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.exp) {
      this.map.delete(key);
      return undefined;
    }
    return entry.val;
  }

  /** maxExpMs optionally clamps the entry lifetime (e.g. to a JWT's own exp). */
  set(key, val, maxExpMs = Infinity) {
    if (this.map.size >= this.max) {
      // Evict oldest insertion — close enough to LRU for our access pattern
      this.map.delete(this.map.keys().next().value);
    }
    this.map.set(key, { val, exp: Math.min(Date.now() + this.ttl, maxExpMs) });
  }

  delete(key) {
    this.map.delete(key);
  }
}

module.exports = TTLCache;
