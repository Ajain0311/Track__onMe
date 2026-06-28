// __tests__/faceUtils.test.js — runs with `node --test`, no extra deps
// Covers the ArcFace embedding comparison + payload validation.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  cosineSimilarity, bestMatch, validateEmbeddingPayload, l2normalize,
  FACE_MATCH_THRESHOLD, FACE_PAYLOAD_VERSION,
} = require('../utils/faceUtils');

// Helpers. Real embeddings are ≥128-d, so build realistic-length test vectors.
const vec = (n, seed = 1) => Array.from({ length: n }, (_, i) => ((i * seed) % 13) / 13 - 0.5);
const makePayload = (vectors, { model = 'mobilefacenet' } = {}) => ({
  __v: FACE_PAYLOAD_VERSION,
  model,
  dim: vectors[0].length,
  embeddings: vectors,
  sampleCount: vectors.length,
});

test('cosineSimilarity: identical vectors → 1', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3, 4], [1, 2, 3, 4]) - 1) < 1e-9);
});

test('cosineSimilarity: scaled vectors are still ~1 (re-normalized)', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [2, 4, 6]) - 1) < 1e-9);
});

test('cosineSimilarity: orthogonal vectors → 0', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9);
});

test('cosineSimilarity: opposite vectors → -1', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 1], [-1, -1]) + 1) < 1e-9);
});

test('cosineSimilarity: length mismatch / non-finite → -1', () => {
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2]), -1);
  assert.equal(cosineSimilarity([1, NaN], [1, 2]), -1);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), -1); // zero vector
});

test('bestMatch: returns the highest similarity across enrolled embeddings', () => {
  const stored = [[1, 0, 0], [0, 1, 0]];
  // probe close to the second enrolled vector
  const sim = bestMatch(stored, [0.05, 0.99, 0]);
  assert.ok(sim > 0.98);
  assert.equal(bestMatch([], [1, 2, 3]), -1);
});

test('FACE_MATCH_THRESHOLD is a strict-ish similarity in (0,1)', () => {
  assert.equal(typeof FACE_MATCH_THRESHOLD, 'number');
  assert.ok(FACE_MATCH_THRESHOLD > 0 && FACE_MATCH_THRESHOLD < 1);
});

test('l2normalize produces a unit vector', () => {
  const n = l2normalize([3, 4]); // norm 5
  assert.ok(Math.abs(n[0] - 0.6) < 1e-9 && Math.abs(n[1] - 0.8) < 1e-9);
});

test('validateEmbeddingPayload: accepts a well-formed __v:3 payload (128-d)', () => {
  assert.equal(validateEmbeddingPayload(makePayload([vec(128, 1), vec(128, 2)]), { minEmbeddings: 2 }), null);
});

test('validateEmbeddingPayload: rejects the old __v:2 geometric format', () => {
  const err = validateEmbeddingPayload({ __v: 2, ratios: { a: 1, b: 2, c: 3 } });
  assert.ok(err && /re-register/i.test(err));
});

test('validateEmbeddingPayload: rejects wrong dim, non-finite, too few embeddings, missing model', () => {
  const bad1 = vec(64); bad1.pop();                       // length 63 != dim 64
  assert.ok(validateEmbeddingPayload({ __v: 3, model: 'm', dim: 64, embeddings: [bad1] }));
  const bad2 = vec(64); bad2[0] = Infinity;               // non-finite
  assert.ok(validateEmbeddingPayload({ __v: 3, model: 'm', dim: 64, embeddings: [bad2] }));
  assert.ok(validateEmbeddingPayload(makePayload([vec(128)]), { minEmbeddings: 2 }));         // too few
  assert.ok(validateEmbeddingPayload({ __v: 3, dim: 128, embeddings: [vec(128)] }));           // missing model
});
