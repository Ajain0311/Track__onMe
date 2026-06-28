// utils/faceUtils.js — Server-side ArcFace embedding comparison.
//
// The device computes a deep face embedding (MobileFaceNet / ArcFace-family,
// on-device TFLite) and uploads only the vector. The server is the AUTHORITY
// on the match: it compares the probe embedding against the user's stored,
// manager-approved enrollment embeddings using COSINE SIMILARITY.
//
// CONVENTION (important — getting this backwards inverts FAR/FRR):
//   cosine SIMILARITY ∈ [-1, 1], where 1.0 = identical direction.
//   cosine DISTANCE   = 1 - similarity.
//   We threshold on SIMILARITY: a match requires similarity >= FACE_MATCH_THRESHOLD.
//   Higher threshold  → stricter → fewer false accepts, more false rejects.
//
// Typical ArcFace/MobileFaceNet operating points (calibrate on YOUR users):
//   similarity ~0.50–0.55  → balanced (near equal-error)
//   similarity ~0.55–0.65  → strict / low false-acceptance (this app's default)
// Default is intentionally strict because the product goal is "zero false
// acceptance"; loosen via FACE_MATCH_THRESHOLD if legitimate users get rejected.

const FACE_PAYLOAD_VERSION = 3;

// Cosine-similarity threshold for a positive match. Env-overridable so it can
// be tuned in production without a redeploy.
const FACE_MATCH_THRESHOLD = (() => {
  const raw = parseFloat(process.env.FACE_MATCH_THRESHOLD);
  if (Number.isFinite(raw) && raw > 0 && raw < 1) return raw;
  return 0.55; // strict default
})();

/** L2-normalize a numeric vector. Returns a new array; zero vectors pass through. */
const l2normalize = (v) => {
  let sumSq = 0;
  for (let i = 0; i < v.length; i++) sumSq += v[i] * v[i];
  const norm = Math.sqrt(sumSq);
  if (!Number.isFinite(norm) || norm === 0) return v.slice();
  return v.map((x) => x / norm);
};

/**
 * Cosine similarity of two embeddings. Re-normalizes internally so the result
 * is correct regardless of whether the client normalized its vectors.
 * Returns a value in [-1, 1]; returns -1 for malformed/length-mismatched input.
 */
const cosineSimilarity = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
    dot += x * y;
    na  += x * x;
    nb  += y * y;
  }
  if (na === 0 || nb === 0) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

/**
 * Best (max) cosine similarity between a probe embedding and a set of stored
 * enrollment embeddings (e.g. front + slight-angle shots). Using the max means
 * a match against ANY enrolled angle counts, which lowers false rejects while
 * the strict threshold keeps false accepts down.
 * @returns {number} best similarity in [-1, 1], or -1 if no valid comparison.
 */
const bestMatch = (storedEmbeddings, probe) => {
  if (!Array.isArray(storedEmbeddings) || storedEmbeddings.length === 0) return -1;
  let best = -1;
  for (const stored of storedEmbeddings) {
    const sim = cosineSimilarity(stored, probe);
    if (sim > best) best = sim;
  }
  return best;
};

/**
 * Validate an uploaded face payload (the `features` object from the client).
 * Returns null if valid, or a human-readable error string.
 *
 * Shape: { __v:3, model:string, dim:int, embeddings:[[...dim], ...], sampleCount?:int }
 * @param {object} features
 * @param {{ minEmbeddings?: number }} [opts]
 */
const validateEmbeddingPayload = (features, { minEmbeddings = 1 } = {}) => {
  if (!features || typeof features !== 'object') return 'features must be an object';
  if (features.__v !== FACE_PAYLOAD_VERSION) {
    return `features.__v must be ${FACE_PAYLOAD_VERSION} (please re-register your face)`;
  }
  if (typeof features.model !== 'string' || !features.model) return 'features.model is required';

  const dim = features.dim;
  if (!Number.isInteger(dim) || dim < 32 || dim > 2048) return 'features.dim must be an integer (32–2048)';

  const embeddings = features.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length < minEmbeddings) {
    return `features.embeddings must be an array of at least ${minEmbeddings} vector(s)`;
  }
  for (let i = 0; i < embeddings.length; i++) {
    const e = embeddings[i];
    if (!Array.isArray(e) || e.length !== dim) {
      return `embedding[${i}] must be a numeric array of length ${dim}`;
    }
    for (let j = 0; j < e.length; j++) {
      if (typeof e[j] !== 'number' || !Number.isFinite(e[j])) {
        return `embedding[${i}][${j}] is not a finite number`;
      }
    }
  }
  return null; // valid
};

module.exports = {
  FACE_PAYLOAD_VERSION,
  FACE_MATCH_THRESHOLD,
  l2normalize,
  cosineSimilarity,
  bestMatch,
  validateEmbeddingPayload,
};
