// services/faceRecognitionService.js
// Face recognition service using Expo Camera built-in face detection.
// Uses AsyncStorage for persistence (no external database dependency).

import AsyncStorage from '@react-native-async-storage/async-storage';

const FACE_DATA_KEY = '@face_data';

export const processDetectedFace = (face) => {
  if (!face) return null;
  return {
    bounds: face.bounds,
    yawAngle: face.yawAngle || face.yaw,
    rollAngle: face.rollAngle || face.roll,
    pitchAngle: face.pitchAngle || face.pitch,
    leftEyeOpenProbability: face.leftEyeOpenProbability,
    rightEyeOpenProbability: face.rightEyeOpenProbability,
    smilingProbability: face.smilingProbability,
    landmarks: face.landmarks || {},
  };
};

export const validateFacePosition = (face) => {
  if (!face) {
    return { valid: false, message: 'No face detected. Please position your face in the frame.', guidance: 'no_face' };
  }

  if (face.bounds) {
    const { size } = face.bounds;
    const faceArea = size.width * size.height;
    if (faceArea < 15000) return { valid: false, message: 'Move closer to the camera', guidance: 'move_closer' };
    if (faceArea > 250000) return { valid: false, message: 'Move back a little', guidance: 'move_back' };
  }

  if (face.yawAngle && Math.abs(face.yawAngle) > 25) {
    return { valid: false, message: 'Turn to face the camera directly', guidance: 'face_forward' };
  }
  if (face.rollAngle && Math.abs(face.rollAngle) > 25) {
    return { valid: false, message: 'Keep your head straight', guidance: 'straighten_head' };
  }
  if (face.pitchAngle && Math.abs(face.pitchAngle) > 20) {
    return { valid: false, message: 'Look straight at the camera', guidance: 'look_straight' };
  }

  if (face.leftEyeOpenProbability !== undefined && face.rightEyeOpenProbability !== undefined) {
    if (face.leftEyeOpenProbability < 0.3 && face.rightEyeOpenProbability < 0.3) {
      return { valid: false, message: 'Please open your eyes', guidance: 'open_eyes' };
    }
  }

  if (face.smilingProbability !== undefined && face.smilingProbability > 0.9) {
    return { valid: false, message: 'Please maintain a neutral expression', guidance: 'neutral_expression' };
  }

  return { valid: true, message: 'Perfect! Hold still...', guidance: 'hold_still' };
};

export const extractFaceFeatures = (face) => {
  if (!face || !face.landmarks) return null;

  const { landmarks } = face;
  const features = {
    leftEye: landmarks.leftEye ? { x: landmarks.leftEye.x, y: landmarks.leftEye.y } : null,
    rightEye: landmarks.rightEye ? { x: landmarks.rightEye.x, y: landmarks.rightEye.y } : null,
    nose: landmarks.nose ? { x: landmarks.nose.x, y: landmarks.nose.y } : null,
    leftMouth: landmarks.leftMouth ? { x: landmarks.leftMouth.x, y: landmarks.leftMouth.y } : null,
    rightMouth: landmarks.rightMouth ? { x: landmarks.rightMouth.x, y: landmarks.rightMouth.y } : null,
    bottomMouth: landmarks.bottomMouth ? { x: landmarks.bottomMouth.x, y: landmarks.bottomMouth.y } : null,
    leftEar: landmarks.leftEar ? { x: landmarks.leftEar.x, y: landmarks.leftEar.y } : null,
    rightEar: landmarks.rightEar ? { x: landmarks.rightEar.x, y: landmarks.rightEar.y } : null,
  };

  if (features.leftEye && features.rightEye) {
    features.eyeDistance = Math.sqrt(
      Math.pow(features.rightEye.x - features.leftEye.x, 2) +
      Math.pow(features.rightEye.y - features.leftEye.y, 2)
    );
  }
  if (features.leftEye && features.nose) {
    features.leftEyeToNose = Math.sqrt(
      Math.pow(features.nose.x - features.leftEye.x, 2) +
      Math.pow(features.nose.y - features.leftEye.y, 2)
    );
  }
  if (features.rightEye && features.nose) {
    features.rightEyeToNose = Math.sqrt(
      Math.pow(features.nose.x - features.rightEye.x, 2) +
      Math.pow(features.nose.y - features.rightEye.y, 2)
    );
  }
  if (features.nose && features.bottomMouth) {
    features.noseToMouth = Math.sqrt(
      Math.pow(features.bottomMouth.x - features.nose.x, 2) +
      Math.pow(features.bottomMouth.y - features.nose.y, 2)
    );
  }

  if (face.bounds) features.bounds = face.bounds;
  features.yawAngle = face.yawAngle;
  features.rollAngle = face.rollAngle;
  features.pitchAngle = face.pitchAngle;

  return features;
};

export const calculateSimilarity = (features1, features2) => {
  if (!features1 || !features2) return 0;

  let totalScore = 0;
  let weightCount = 0;

  if (features1.eyeDistance && features2.eyeDistance) {
    const ratio = Math.min(features1.eyeDistance, features2.eyeDistance) /
                  Math.max(features1.eyeDistance, features2.eyeDistance);
    totalScore += ratio * 0.4;
    weightCount += 0.4;
  }
  if (features1.leftEyeToNose && features2.leftEyeToNose) {
    const ratio = Math.min(features1.leftEyeToNose, features2.leftEyeToNose) /
                  Math.max(features1.leftEyeToNose, features2.leftEyeToNose);
    totalScore += ratio * 0.2;
    weightCount += 0.2;
  }
  if (features1.rightEyeToNose && features2.rightEyeToNose) {
    const ratio = Math.min(features1.rightEyeToNose, features2.rightEyeToNose) /
                  Math.max(features1.rightEyeToNose, features2.rightEyeToNose);
    totalScore += ratio * 0.2;
    weightCount += 0.2;
  }
  if (features1.noseToMouth && features2.noseToMouth) {
    const ratio = Math.min(features1.noseToMouth, features2.noseToMouth) /
                  Math.max(features1.noseToMouth, features2.noseToMouth);
    totalScore += ratio * 0.2;
    weightCount += 0.2;
  }

  return weightCount === 0 ? 0 : totalScore / weightCount;
};

export const saveFaceData = async (userId, faceFeatures, imageUri) => {
  const faceData = {
    userId,
    features: faceFeatures,
    imageUri,
    registeredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(`${FACE_DATA_KEY}_${userId}`, JSON.stringify(faceData));
  console.log('[FaceRecognition] Face data saved for user:', userId);
  return true;
};

export const getFaceData = async (userId) => {
  try {
    const data = await AsyncStorage.getItem(`${FACE_DATA_KEY}_${userId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('[FaceRecognition] Error reading face data:', error);
    return null;
  }
};

export const hasFaceData = async (userId) => {
  const faceData = await getFaceData(userId);
  return faceData !== null && faceData.features !== null;
};

export const verifyFace = async (userId, currentFaceFeatures, threshold = 0.5, imageUri = null) => {
  try {
    const storedFaceData = await getFaceData(userId);

    if (!storedFaceData || !storedFaceData.features) {
      if (imageUri) {
        await saveFaceData(userId, currentFaceFeatures, imageUri);
        return { success: true, message: 'Face registered successfully! You can now check in.', similarity: 1.0, isNewRegistration: true };
      }
      return { success: false, message: 'No face data registered. Please register your face first.', similarity: 0 };
    }

    const similarity = calculateSimilarity(storedFaceData.features, currentFaceFeatures);
    console.log('[FaceRecognition] Face similarity:', similarity);

    if (similarity >= threshold) {
      return { success: true, message: 'Face verified successfully', similarity };
    }
    return { success: false, message: 'Face does not match. Please try again.', similarity };
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
    imageUri,
    registeredAt: existing?.registeredAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(`${FACE_DATA_KEY}_${userId}`, JSON.stringify(faceData));
  return true;
};

export const deleteFaceData = async (userId) => {
  await AsyncStorage.removeItem(`${FACE_DATA_KEY}_${userId}`);
  console.log('[FaceRecognition] Face data deleted for user:', userId);
  return true;
};
