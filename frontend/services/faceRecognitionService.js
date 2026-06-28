// services/faceRecognitionService.js
// Face DETECTION + position/quality validation via Google ML Kit (on-device,
// native only). Recognition itself (the embedding + match) lives in
// faceEmbeddingService.js (on-device) and is decided server-side.
//
// NOTE: the old geometric-ratio matching + AsyncStorage face templates were
// removed in the ArcFace migration. The server now stores embeddings and is the
// single authority on the match — there is no local face template anymore.

import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Face detection — Google ML Kit (on-device, native only)
// @react-native-ml-kit/face-detection. landmarks + Euler angles are used for
// single-face checks, pose/quality validation, and the blink liveness challenge.
// ─────────────────────────────────────────────────────────────────────────────

let MLKitFaceDetection = null;
if (Platform.OS !== 'web') {
  try {
    MLKitFaceDetection = require('@react-native-ml-kit/face-detection').default;
  } catch (e) {
    console.warn('[FaceRecognition] ML Kit face detection module unavailable:', e?.message);
  }
}

export const isFaceDetectionAvailable = () => Platform.OS !== 'web' && !!MLKitFaceDetection;

/**
 * Detect faces in a captured photo and normalize them to:
 * {bounds, yawAngle, rollAngle, pitchAngle, smilingProbability,
 *  left/rightEyeOpenProbability, landmarks:{leftEye,rightEye,nose,...}}.
 */
export const detectFacesFromImage = async (imageUri) => {
  if (!MLKitFaceDetection) throw new Error('FACE_MODULE_MISSING');
  const faces = await MLKitFaceDetection.detect(imageUri, {
    performanceMode: 'fast',
    landmarkMode: 'all',
    classificationMode: 'all',
    minFaceSize: 0.15,
  });
  return (faces || []).map((f) => ({
    bounds: {
      origin: { x: f.frame?.left ?? 0, y: f.frame?.top ?? 0 },
      size: { width: f.frame?.width ?? 0, height: f.frame?.height ?? 0 },
    },
    // ML Kit Euler angles: X = pitch, Y = yaw, Z = roll
    yawAngle:   f.rotationY,
    rollAngle:  f.rotationZ,
    pitchAngle: f.rotationX,
    smilingProbability:      f.smilingProbability,
    leftEyeOpenProbability:  f.leftEyeOpenProbability,
    rightEyeOpenProbability: f.rightEyeOpenProbability,
    landmarks: {
      leftEye:     f.landmarks?.leftEye?.position,
      rightEye:    f.landmarks?.rightEye?.position,
      nose:        f.landmarks?.noseBase?.position,
      leftMouth:   f.landmarks?.mouthLeft?.position,
      rightMouth:  f.landmarks?.mouthRight?.position,
      bottomMouth: f.landmarks?.mouthBottom?.position,
    },
  }));
};

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

/**
 * Validate face position/pose for a usable frame (frontal, level, eyes open,
 * neutral). Returns { valid, message, guidance }.
 */
export const validateFacePosition = (face) => {
  if (!face) return { valid: false, message: 'No face detected. Please position your face in the frame.', guidance: 'no_face' };

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

  return { valid: true, message: 'Hold still…', guidance: 'hold_still' };
};
