// services/faceRecognitionService.js
// Robust face recognition using normalized geometric ratios.
// All distances are normalized by the inter-ocular (eye-to-eye) distance,
// making measurements scale-invariant (independent of face distance from camera).

import AsyncStorage from '@react-native-async-storage/async-storage';

const FACE_DATA_KEY = '@face_data_v2';   // v2 = new normalized format
const OLD_FACE_DATA_KEY = '@face_data';   // old format — detect & reject

// ─────────────────────────────────────────────────────────────────────────────
// Face position validation (unchanged from before)
// ─────────────────────────────────────────────────────────────────────────────

export const processDetectedFace = (face) => {
  if (!face) return null;
  return {
    bounds: face.bounds,
    yawAngle: face.yawAngle ?? face.yaw ?? 0,
    rollAngle: face.rollAngle ?? face.roll ?? 0,
    pitchAngle: face.pitchAngle ?? face.pitch ?? 0,
    leftEyeOpenProbability: face.leftEyeOpenProbability,
    rightEyeOpenProbability: face.rightEyeOpenProbability,
    smilingProbability: face.smilingProbability,
    landmarks: face.landmarks || {},
  };
};

export const validateFacePosition = (face) => {
  if (!face) return { valid: false, message: 'No face detected. Please position your face in the frame.', guidance: 'no_face' };

  // NOTE: Absolute pixel area checks removed — detectFacesAsync returns face bounds in
  // full-resolution photo coordinates (e.g. 3024×4032 on a 12 MP sensor), so a normal
  // selfie face easily exceeds any fixed pixel threshold calibrated for a low-res preview.
  // Size is validated implicitly: extractFaceFeatures returns null when eyeDist < 20 px.

  if (face.yawAngle !== undefined && Math.abs(face.yawAngle) > 35)
    return { valid: false, message: 'Turn to face the camera directly', guidance: 'face_forward' };
  if (face.rollAngle !== undefined && Math.abs(face.rollAngle) > 35)
    return { valid: false, message: 'Keep your head straight', guidance: 'straighten_head' };
  if (face.pitchAngle !== undefined && Math.abs(face.pitchAngle) > 30)
    return { valid: false, message: 'Look straight at the camera', guidance: 'look_straight' };

  if (face.leftEyeOpenProbability !== undefined && face.rightEyeOpenProbability !== undefined) {
    if (face.leftEyeOpenProbability < 0.35 && face.rightEyeOpenProbability < 0.35)
      return { valid: false, message: 'Please open your eyes', guidance: 'open_eyes' };
  }

  if (face.smilingProbability !== undefined && face.smilingProbability > 0.9)
    return { valid: false, message: 'Please maintain a neutral expression', guidance: 'neutral_expression' };

  return { valid: true, message: 'Perfect! Hold still...', guidance: 'hold_still' };
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature extraction — all ratios normalized by inter-ocular distance
// ─────────────────────────────────────────────────────────────────────────────

export const extractFaceFeatures = (face) => {
  if (!face || !face.landmarks) return null;

  const { landmarks } = face;
  const L = landmarks;

  const leftEye   = L.leftEye;
  const rightEye  = L.rightEye;
  const nose      = L.nose;
  const lMouth    = L.leftMouth;
  const rMouth    = L.rightMouth;
  const bMouth    = L.bottomMouth;

  // Both eyes required for normalization
  if (!leftEye || !rightEye) return null;

  const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  if (eyeDist < 20) return null; // Face too small to measure reliably

  const eyeCenter = {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2,
  };

  // ─── Normalized ratios ─────────────────────────────────────────────────────
  // All values are divided by eyeDist, making them camera-distance independent.
  const ratios = {};

  // Eye-level difference (symmetry of eye positions)
  ratios.eyeLevel = Math.abs(leftEye.y - rightEye.y) / eyeDist;

  if (nose) {
    // Nose vertical position below eye center
    ratios.noseVertical   = (nose.y - eyeCenter.y) / eyeDist;
    // Nose lateral offset from eye midpoint (should be ~0 for frontal faces)
    ratios.noseHoriz      = (nose.x - eyeCenter.x) / eyeDist;
    // Diagonal distances from each eye to nose
    ratios.leftEyeNose    = Math.hypot(nose.x - leftEye.x,  nose.y - leftEye.y)  / eyeDist;
    ratios.rightEyeNose   = Math.hypot(nose.x - rightEye.x, nose.y - rightEye.y) / eyeDist;

    if (bMouth) {
      ratios.noseToMouth  = Math.hypot(bMouth.x - nose.x, bMouth.y - nose.y) / eyeDist;
      ratios.mouthVertical = (bMouth.y - eyeCenter.y) / eyeDist;
      ratios.noseToMouthV  = (bMouth.y - nose.y) / eyeDist;
    }

    if (lMouth && rMouth) {
      ratios.mouthWidth    = Math.hypot(rMouth.x - lMouth.x, rMouth.y - lMouth.y) / eyeDist;
      const mCX = (lMouth.x + rMouth.x) / 2;
      const mCY = (lMouth.y + rMouth.y) / 2;
      ratios.mouthHoriz    = (mCX - eyeCenter.x) / eyeDist;
      if (nose) {
        ratios.noseMouthCenter = Math.hypot(mCX - nose.x, mCY - nose.y) / eyeDist;
      }
    }
  }

  // Face aspect (height/width from bounds) — avoid pitch-sensitive measurements
  // We keep this only for sanity; it's not used in similarity
  const bounds = face.bounds;

  return {
    __v: 2,               // version marker — used to reject old format
    ratios,
    eyeDistance: eyeDist, // stored for debug/display only
    bounds,
    yawAngle:   face.yawAngle,
    rollAngle:  face.rollAngle,
    pitchAngle: face.pitchAngle,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Average a collection of feature objects (for multi-sample registration)
// ─────────────────────────────────────────────────────────────────────────────

export const averageFeatures = (featuresList) => {
  if (!featuresList || featuresList.length === 0) return null;

  const validList = featuresList.filter((f) => f && f.ratios && f.__v === 2);
  if (validList.length === 0) return null;

  // Collect all ratio keys
  const allKeys = new Set();
  validList.forEach((f) => Object.keys(f.ratios).forEach((k) => allKeys.add(k)));

  const averaged = {};
  for (const key of allKeys) {
    const vals = validList.map((f) => f.ratios[key]).filter((v) => v !== undefined);
    if (vals.length === 0) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length;
    averaged[key] = {
      mean,
      std: Math.sqrt(variance), // Per-ratio standard deviation
    };
  }

  // Merge into a features object with averaged ratios
  return {
    __v: 2,
    ratios: Object.fromEntries(Object.entries(averaged).map(([k, v]) => [k, v.mean])),
    ratioStds: Object.fromEntries(Object.entries(averaged).map(([k, v]) => [k, v.std])),
    sampleCount: validList.length,
    eyeDistance: validList.reduce((a, f) => a + f.eyeDistance, 0) / validList.length,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Similarity calculation — Gaussian scoring per normalized ratio
// ─────────────────────────────────────────────────────────────────────────────

// SIGMA controls sensitivity:
//   Within-person variation (different lighting/pose): ~0.03–0.08
//   Between-person variation: ~0.10–0.30
//   A SIGMA of 0.07 means:
//     |diff| = 0.00 → score 1.00 (perfect)
//     |diff| = 0.07 → score 0.61
//     |diff| = 0.14 → score 0.14
//     |diff| = 0.20 → score 0.01
const SIGMA = 0.07;

export const calculateSimilarity = (features1, features2) => {
  if (!features1 || !features2) return 0;

  // Reject old-format features (pre-v2) — force re-registration
  if (features1.__v !== 2 || features2.__v !== 2) return 0;

  const r1 = features1.ratios;
  const r2 = features2.ratios;
  if (!r1 || !r2) return 0;

  // Only compare keys present in BOTH feature sets
  const keys = Object.keys(r1).filter((k) => r2[k] !== undefined);
  if (keys.length < 3) return 0; // Not enough features to make a decision

  let totalScore = 0;
  for (const k of keys) {
    const diff = Math.abs(r1[k] - r2[k]);
    // Gaussian decay — perfectly stable ratios yield 1.0, large deviations → 0
    totalScore += Math.exp(-(diff * diff) / (2 * SIGMA * SIGMA));
  }

  return totalScore / keys.length;
};

// ─────────────────────────────────────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────────────────────────────────────

export const saveFaceData = async (userId, faceFeatures, imageUri) => {
  const faceData = {
    userId,
    features: faceFeatures,
    imageUri: imageUri || null,
    registeredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(`${FACE_DATA_KEY}_${userId}`, JSON.stringify(faceData));
  console.log('[FaceRecognition] Face data (v2) saved for user:', userId, '| samples:', faceFeatures?.sampleCount || 1);
  return true;
};

export const getFaceData = async (userId) => {
  try {
    // Try new format first
    const newData = await AsyncStorage.getItem(`${FACE_DATA_KEY}_${userId}`);
    if (newData) {
      const parsed = JSON.parse(newData);
      // Reject if features are old format (no __v or __v !== 2)
      if (parsed?.features?.__v === 2) return parsed;
    }
    // Old-format data exists — signal that re-registration is required
    const oldData = await AsyncStorage.getItem(`${OLD_FACE_DATA_KEY}_${userId}`);
    if (oldData) {
      console.warn('[FaceRecognition] Old-format face data detected — user must re-register');
      return { needsReRegistration: true };
    }
    return null;
  } catch (error) {
    console.error('[FaceRecognition] Error reading face data:', error);
    return null;
  }
};

export const hasFaceData = async (userId) => {
  const data = await getFaceData(userId);
  if (!data) return false;
  if (data.needsReRegistration) return false; // Old format, treat as not registered
  return data.features?.__v === 2;
};

export const verifyFace = async (userId, currentFeatures, threshold = 0.82, _imageUri = null) => {
  try {
    const stored = await getFaceData(userId);

    if (!stored || stored.needsReRegistration) {
      return {
        success: false,
        message: 'Face not registered or outdated. Please register your face in Settings.',
        similarity: 0,
        needsReRegistration: !!stored?.needsReRegistration,
      };
    }
    if (!stored.features) {
      return { success: false, message: 'No face data found. Please register your face.', similarity: 0 };
    }

    // Both must be v2 format
    if (currentFeatures?.__v !== 2) {
      return { success: false, message: 'Could not extract face features. Try again.', similarity: 0 };
    }

    const similarity = calculateSimilarity(stored.features, currentFeatures);
    console.log('[FaceRecognition] Similarity score:', (similarity * 100).toFixed(1) + '%', '| threshold:', (threshold * 100).toFixed(0) + '%');

    if (similarity >= threshold) {
      return { success: true, message: 'Face verified successfully', similarity };
    }
    return {
      success: false,
      message: similarity > 0.6
        ? 'Partial match — adjust lighting or position and try again.'
        : 'Face does not match. Please try again.',
      similarity,
    };
  } catch (error) {
    console.error('[FaceRecognition] Verification error:', error);
    return { success: false, message: 'Error during face verification: ' + error.message, similarity: 0 };
  }
};

export const updateFaceData = async (userId, faceFeatures, imageUri) => {
  const existing = await getFaceData(userId);
  const faceData = {
    userId,
    features: faceFeatures,
    imageUri: imageUri || null,
    registeredAt: existing?.registeredAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(`${FACE_DATA_KEY}_${userId}`, JSON.stringify(faceData));
  return true;
};

export const deleteFaceData = async (userId) => {
  await Promise.all([
    AsyncStorage.removeItem(`${FACE_DATA_KEY}_${userId}`),
    AsyncStorage.removeItem(`${OLD_FACE_DATA_KEY}_${userId}`), // clean up old format too
  ]);
  console.log('[FaceRecognition] Face data deleted for user:', userId);
  return true;
};
