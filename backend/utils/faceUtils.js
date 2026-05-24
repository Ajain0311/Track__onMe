// utils/faceUtils.js — Server-side face feature validation + similarity scoring
// Must stay in sync with frontend/services/faceRecognitionService.js
// (same algorithm, same sigma, same threshold)

const SIGMA = 0.07;
const SIMILARITY_THRESHOLD = 0.82; // 82% — same as frontend

/**
 * Gaussian similarity per ratio: perfect match = 1.0, large diff → 0.
 * All ratios are normalized by inter-ocular distance, making them
 * scale-invariant (face distance from camera doesn't matter).
 */
const calculateSimilarity = (features1, features2) => {
  if (!features1 || !features2) return 0;
  if (features1.__v !== 2 || features2.__v !== 2) return 0;

  const r1 = features1.ratios;
  const r2 = features2.ratios;
  if (!r1 || !r2) return 0;

  const keys = Object.keys(r1).filter((k) => r2[k] !== undefined);
  if (keys.length < 3) return 0; // need at least 3 landmarks

  let totalScore = 0;
  for (const k of keys) {
    const diff = Math.abs(r1[k] - r2[k]);
    totalScore += Math.exp(-(diff * diff) / (2 * SIGMA * SIGMA));
  }

  return totalScore / keys.length;
};

/**
 * Validates that a face feature object is well-formed.
 * Returns null if valid, or an error string if invalid.
 */
const validateFaceFeatures = (features) => {
  if (!features || typeof features !== 'object') return 'features must be an object';
  if (features.__v !== 2) return 'features.__v must be 2 (re-register required)';
  if (!features.ratios || typeof features.ratios !== 'object') return 'features.ratios is required';

  const keys = Object.keys(features.ratios);
  if (keys.length < 3) return `insufficient feature data (${keys.length} ratios, need ≥ 3)`;

  for (const [k, v] of Object.entries(features.ratios)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return `feature ratio "${k}" is not a finite number`;
    }
  }
  return null; // valid
};

module.exports = { calculateSimilarity, validateFaceFeatures, SIGMA, SIMILARITY_THRESHOLD };
