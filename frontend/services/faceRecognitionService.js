// services/faceRecognitionService.js
// Face recognition service using Expo Camera built-in face detection
// Stores and matches face data for check-in/check-out

import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebaseConfig';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';

const FACE_DATA_KEY = '@face_data';
const FACE_COLLECTION = 'userFaces';

/**
 * Face detection is now handled by CameraView's onFacesDetected prop
 * This function is kept for compatibility but uses captured face data
 * @param {Object} face - Face object from CameraView onFacesDetected
 * @returns {Object} - Normalized face data
 */
export const processDetectedFace = (face) => {
  if (!face) return null;
  
  // Normalize face data from CameraView format
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

/**
 * Check if a face is properly positioned for capture
 * Optimized for low-quality cameras and poor lighting
 * @param {Object} face - Face detection result
 * @returns {Object} - Validation result with status, message, and guidance type
 */
export const validateFacePosition = (face) => {
  if (!face) {
    return { 
      valid: false, 
      message: 'No face detected. Please position your face in the frame.',
      guidance: 'no_face'
    };
  }

  // Check face bounds first (most reliable indicator)
  if (face.bounds) {
    const { size } = face.bounds;
    const faceArea = size.width * size.height;
    const minFaceArea = 15000; // Reduced from 20000 for low-res cameras
    const maxFaceArea = 250000; // Prevent face too close
    
    if (faceArea < minFaceArea) {
      return { 
        valid: false, 
        message: 'Move closer to the camera',
        guidance: 'move_closer'
      };
    }
    
    if (faceArea > maxFaceArea) {
      return { 
        valid: false, 
        message: 'Move back a little',
        guidance: 'move_back'
      };
    }
  }

  // Relaxed angle checks for poor lighting conditions
  // Yaw (left/right rotation) - more lenient
  if (face.yawAngle && Math.abs(face.yawAngle) > 25) {
    return { 
      valid: false, 
      message: 'Turn to face the camera directly',
      guidance: 'face_forward'
    };
  }

  // Roll (tilt) - more lenient
  if (face.rollAngle && Math.abs(face.rollAngle) > 25) {
    return { 
      valid: false, 
      message: 'Keep your head straight',
      guidance: 'straighten_head'
    };
  }

  // Pitch (up/down) - check if available
  if (face.pitchAngle && Math.abs(face.pitchAngle) > 20) {
    return { 
      valid: false, 
      message: 'Look straight at the camera',
      guidance: 'look_straight'
    };
  }

  // Eyes check - more lenient for low light
  // Only check if probabilities are available and reliable
  if (face.leftEyeOpenProbability !== undefined && face.rightEyeOpenProbability !== undefined) {
    const leftEyeOpen = face.leftEyeOpenProbability > 0.3; // Reduced from 0.5
    const rightEyeOpen = face.rightEyeOpenProbability > 0.3;
    if (!leftEyeOpen && !rightEyeOpen) {
      return { 
        valid: false, 
        message: 'Please open your eyes',
        guidance: 'open_eyes'
      };
    }
  }

  // Liveness check - relaxed
  if (face.smilingProbability !== undefined && face.smilingProbability > 0.9) {
    return { 
      valid: false, 
      message: 'Please maintain a neutral expression',
      guidance: 'neutral_expression'
    };
  }

  return { 
    valid: true, 
    message: 'Perfect! Hold still...',
    guidance: 'hold_still'
  };
};

/**
 * Extract face features for comparison
 * This creates a simplified feature vector from face landmarks
 * @param {Object} face - Face detection result
 * @returns {Object} - Face features
 */
export const extractFaceFeatures = (face) => {
  if (!face || !face.landmarks) {
    return null;
  }

  const { landmarks } = face;
  
  // Extract key landmark positions
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

  // Calculate relative distances between landmarks
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

  // Store face bounds for reference
  if (face.bounds) {
    features.bounds = face.bounds;
  }

  // Store face angles for reference
  features.yawAngle = face.yawAngle;
  features.rollAngle = face.rollAngle;
  features.pitchAngle = face.pitchAngle;

  return features;
};

/**
 * Calculate similarity score between two face features
 * @param {Object} features1 - First face features
 * @param {Object} features2 - Second face features
 * @returns {number} - Similarity score (0-1, where 1 is identical)
 */
export const calculateSimilarity = (features1, features2) => {
  if (!features1 || !features2) {
    return 0;
  }

  let totalScore = 0;
  let weightCount = 0;

  // Compare eye distance (most reliable feature)
  if (features1.eyeDistance && features2.eyeDistance) {
    const ratio = Math.min(features1.eyeDistance, features2.eyeDistance) / 
                  Math.max(features1.eyeDistance, features2.eyeDistance);
    totalScore += ratio * 0.4; // 40% weight
    weightCount += 0.4;
  }

  // Compare left eye to nose distance
  if (features1.leftEyeToNose && features2.leftEyeToNose) {
    const ratio = Math.min(features1.leftEyeToNose, features2.leftEyeToNose) / 
                  Math.max(features1.leftEyeToNose, features2.leftEyeToNose);
    totalScore += ratio * 0.2; // 20% weight
    weightCount += 0.2;
  }

  // Compare right eye to nose distance
  if (features1.rightEyeToNose && features2.rightEyeToNose) {
    const ratio = Math.min(features1.rightEyeToNose, features2.rightEyeToNose) / 
                  Math.max(features1.rightEyeToNose, features2.rightEyeToNose);
    totalScore += ratio * 0.2; // 20% weight
    weightCount += 0.2;
  }

  // Compare nose to mouth distance
  if (features1.noseToMouth && features2.noseToMouth) {
    const ratio = Math.min(features1.noseToMouth, features2.noseToMouth) / 
                  Math.max(features1.noseToMouth, features2.noseToMouth);
    totalScore += ratio * 0.2; // 20% weight
    weightCount += 0.2;
  }

  if (weightCount === 0) {
    return 0;
  }

  return totalScore / weightCount;
};

/**
 * Save face data to Firebase for a user
 * @param {string} userId - User ID
 * @param {Object} faceFeatures - Extracted face features
 * @param {string} imageUri - URI of the captured face image
 */
export const saveFaceData = async (userId, faceFeatures, imageUri) => {
  const faceData = {
    userId,
    features: faceFeatures,
    imageUri,
    registeredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Always save to local storage first (works offline)
  try {
    await AsyncStorage.setItem(`${FACE_DATA_KEY}_${userId}`, JSON.stringify(faceData));
    console.log('[FaceRecognition] Face data saved to local storage for user:', userId);
  } catch (localError) {
    console.error('[FaceRecognition] Error saving to local storage:', localError);
  }

  // Try to save to Firestore (may fail due to permissions on web)
  try {
    const faceDocRef = doc(db, FACE_COLLECTION, userId);
    await setDoc(faceDocRef, faceData);
    console.log('[FaceRecognition] Face data saved to Firestore for user:', userId);
  } catch (error) {
    // Permission errors are expected on web when not properly authenticated
    if (error.code === 'permission-denied') {
      console.log('[FaceRecognition] Firestore permission denied, using local storage only');
    } else {
      console.error('[FaceRecognition] Error saving to Firestore:', error);
    }
    // Don't throw - local storage save is sufficient for functionality
  }
  
  return true;
};

/**
 * Get stored face data for a user
 * @param {string} userId - User ID
 * @returns {Object|null} - Face data or null if not found
 */
export const getFaceData = async (userId) => {
  // Try local storage first (faster and works offline)
  try {
    const localData = await AsyncStorage.getItem(`${FACE_DATA_KEY}_${userId}`);
    if (localData) {
      return JSON.parse(localData);
    }
  } catch (localError) {
    console.error('[FaceRecognition] Local storage read failed:', localError);
  }
  
  // Try Firestore as fallback (may fail due to permissions on web)
  try {
    const faceDocRef = doc(db, FACE_COLLECTION, userId);
    const faceDoc = await getDoc(faceDocRef);

    if (faceDoc.exists()) {
      const data = faceDoc.data();
      // Cache to local storage for next time
      try {
        await AsyncStorage.setItem(`${FACE_DATA_KEY}_${userId}`, JSON.stringify(data));
      } catch (e) {
        // Ignore cache write errors
      }
      return data;
    }
  } catch (error) {
    // Permission errors are expected on web when not properly authenticated
    if (error.code === 'permission-denied') {
      console.log('[FaceRecognition] Firestore permission denied, using local storage only');
    } else {
      console.error('[FaceRecognition] Firestore error:', error);
    }
  }
  
  return null;
};

/**
 * Check if user has registered face data
 * @param {string} userId - User ID
 * @returns {Promise<boolean>}
 */
export const hasFaceData = async (userId) => {
  const faceData = await getFaceData(userId);
  return faceData !== null && faceData.features !== null;
};

/**
 * Verify face against stored data
 * @param {string} userId - User ID
 * @param {Object} currentFaceFeatures - Features from current face capture
 * @param {number} threshold - Minimum similarity threshold (0-1)
 * @param {string} imageUri - Optional image URI for auto-registration
 * @returns {Object} - Verification result
 */
export const verifyFace = async (userId, currentFaceFeatures, threshold = 0.5, imageUri = null) => {
  try {
    const storedFaceData = await getFaceData(userId);

    // If no face data exists, auto-register on first verification attempt
    if (!storedFaceData || !storedFaceData.features) {
      if (imageUri) {
        console.log('[FaceRecognition] No face data found. Auto-registering...');
        await saveFaceData(userId, currentFaceFeatures, imageUri);
        return {
          success: true,
          message: 'Face registered successfully! You can now check in.',
          similarity: 1.0,
          isNewRegistration: true,
        };
      }
      return {
        success: false,
        message: 'No face data registered. Please register your face first.',
        similarity: 0,
      };
    }

    const similarity = calculateSimilarity(storedFaceData.features, currentFaceFeatures);
    
    console.log('[FaceRecognition] Face similarity:', similarity);

    if (similarity >= threshold) {
      return {
        success: true,
        message: 'Face verified successfully',
        similarity,
      };
    } else {
      return {
        success: false,
        message: 'Face does not match. Please try again.',
        similarity,
      };
    }
  } catch (error) {
    console.error('[FaceRecognition] Verification error:', error);
    return {
      success: false,
      message: 'Error during face verification: ' + error.message,
      similarity: 0,
    };
  }
};

/**
 * Update face data (for re-registration)
 * @param {string} userId - User ID
 * @param {Object} faceFeatures - New face features
 * @param {string} imageUri - New image URI
 */
export const updateFaceData = async (userId, faceFeatures, imageUri) => {
  try {
    const faceData = {
      userId,
      features: faceFeatures,
      imageUri,
      updatedAt: new Date().toISOString(),
    };

    const faceDocRef = doc(db, FACE_COLLECTION, userId);
    await updateDoc(faceDocRef, faceData);

    await AsyncStorage.setItem(`${FACE_DATA_KEY}_${userId}`, JSON.stringify({
      ...faceData,
      registeredAt: (await getFaceData(userId)).registeredAt,
    }));

    return true;
  } catch (error) {
    console.error('[FaceRecognition] Error updating face data:', error);
    throw error;
  }
};

/**
 * Delete face data for a user
 * @param {string} userId - User ID
 */
export const deleteFaceData = async (userId) => {
  // Always delete from local storage first
  try {
    await AsyncStorage.removeItem(`${FACE_DATA_KEY}_${userId}`);
    console.log('[FaceRecognition] Face data deleted from local storage for user:', userId);
  } catch (localError) {
    console.error('[FaceRecognition] Error deleting from local storage:', localError);
  }
  
  // Try to delete from Firestore (may fail due to permissions on web)
  try {
    const faceDocRef = doc(db, FACE_COLLECTION, userId);
    await setDoc(faceDocRef, { deleted: true, deletedAt: new Date().toISOString() });
    console.log('[FaceRecognition] Face data deleted from Firestore for user:', userId);
  } catch (error) {
    if (error.code === 'permission-denied') {
      console.log('[FaceRecognition] Firestore permission denied, local data deleted only');
    } else {
      console.error('[FaceRecognition] Error deleting from Firestore:', error);
    }
  }
  
  return true;
};
