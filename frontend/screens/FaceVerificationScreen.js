// screens/FaceVerificationScreen.js
// Screen for face verification during check-in/check-out

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  Dimensions
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import useAuthStore from '../store/authStore';
import useTimeStore from '../store/timeStore';
import {
  processDetectedFace,
  validateFacePosition,
  extractFaceFeatures,
  verifyFace,
  hasFaceData,
} from '../services/faceRecognitionService';
import { checkIn, checkOut, getApiErrorMessage } from '../services/api';

const { width: screenWidth } = Dimensions.get('window');
const CAMERA_SIZE = Math.min(screenWidth - 48, 400);

export default function FaceVerificationScreen({ navigation, route }) {
  const { mode } = route.params || { mode: 'checkin' }; // 'checkin' or 'checkout'
  const { colors: g, gradients: grad } = useThemeStore();
  const { user } = useAuthStore();
  const { checkIn: storeCheckIn, checkOut: storeCheckOut } = useTimeStore();
  
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceMessage, setFaceMessage] = useState('Position your face in the frame');
  const [similarity, setSimilarity] = useState(0);
  const [guidanceType, setGuidanceType] = useState('no_face');
  const [faceBounds, setFaceBounds] = useState(null);
  const [lightingQuality, setLightingQuality] = useState('unknown');
  const cameraRef = useRef(null);
  const currentFaceRef = useRef(null);
  const lastDetectionTimeRef = useRef(Date.now());

  // Check if face is registered - must be before any early returns
  useEffect(() => {
    const checkFaceRegistration = async () => {
      if (user?.id) {
        const hasData = await hasFaceData(user.id);
        if (!hasData) {
          Alert.alert(
            'Face Not Registered',
            'You need to register your face before using face recognition.',
            [
              { 
                text: 'Register Now', 
                onPress: () => navigation.replace('FaceRegistration') 
              },
              { 
                text: 'Cancel', 
                style: 'cancel',
                onPress: () => navigation.goBack()
              },
            ]
          );
        }
      }
    };
    checkFaceRegistration();
  }, [user, navigation]);

  // Check for detection timeout - must be before any early returns
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const timeSinceLastDetection = Date.now() - lastDetectionTimeRef.current;
      if (timeSinceLastDetection > 5000 && !faceDetected && !isProcessing) {
        setFaceMessage('Camera detection slow. Try adjusting lighting...');
        setGuidanceType('poor_lighting');
      }
    }, 2000);
    
    return () => clearInterval(checkInterval);
  }, [faceDetected, isProcessing]);

  // Handle face detection from camera stream - defined before early returns
  const handleFacesDetected = ({ faces }) => {
    if (isProcessing) return;
    
    lastDetectionTimeRef.current = Date.now();

    if (faces.length === 0) {
      setFaceDetected(false);
      setFaceMessage('No face detected');
      setSimilarity(0);
      setGuidanceType('no_face');
      setFaceBounds(null);
      currentFaceRef.current = null;
      setLightingQuality('unknown');
      return;
    }

    if (faces.length > 1) {
      setFaceDetected(false);
      setFaceMessage('Multiple faces detected');
      setSimilarity(0);
      setGuidanceType('multiple_faces');
      setFaceBounds(null);
      currentFaceRef.current = null;
      return;
    }

    const face = processDetectedFace(faces[0]);
    currentFaceRef.current = face;
    
    // Estimate lighting quality
    const hasGoodLighting = face.leftEyeOpenProbability !== undefined || 
                           face.rightEyeOpenProbability !== undefined;
    setLightingQuality(hasGoodLighting ? 'good' : 'poor');
    
    // Update face bounds for visual feedback
    if (face.bounds) {
      setFaceBounds(face.bounds);
    }
    
    const validation = validateFacePosition(face);
    setGuidanceType(validation.guidance);

    if (validation.valid) {
      setFaceDetected(true);
      setFaceMessage('✓ Face detected. Tap Verify');
    } else {
      setFaceDetected(false);
      setFaceMessage(validation.message);
      setSimilarity(0);
    }
  };

  // Handle camera permission - early returns after all hooks
  if (!permission) {
    return (
      <LinearGradient colors={grad.screen} style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={g.accent} />
          <Text style={[styles.loadingText, { color: g.textMuted }]}>Loading camera...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!permission.granted) {
    return (
      <LinearGradient colors={grad.screen} style={styles.container}>
        <View style={styles.centered}>
          <Text style={[styles.title, { color: g.text }]}>Camera Permission Required</Text>
          <Text style={[styles.subtitle, { color: g.textMuted, marginBottom: 24 }]}>
            We need camera access to verify your face for attendance.
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: g.accent }]}
            onPress={requestPermission}
          >
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  // Verify face and proceed with check-in/check-out
  const verifyAndProceed = async () => {
    if (!cameraRef.current || !faceDetected || !currentFaceRef.current) {
      Alert.alert('Error', 'Please position your face correctly before verifying.');
      return;
    }

    setIsProcessing(true);

    try {
      // Take picture
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });

      // Use the face data from live detection
      const face = currentFaceRef.current;

      // Extract features
      const faceFeatures = extractFaceFeatures(face);

      if (!faceFeatures) {
        Alert.alert('Error', 'Failed to extract face features. Please try again.');
        setIsProcessing(false);
        return;
      }

      // Verify face against stored data (auto-register if no face data exists)
      const verificationResult = await verifyFace(user.id, faceFeatures, 0.75, photo.uri);
      setSimilarity(verificationResult.similarity);

      if (!verificationResult.success) {
        Alert.alert('Verification Failed', verificationResult.message);
        setIsProcessing(false);
        return;
      }

      // If this was a new registration, show success and return
      if (verificationResult.isNewRegistration) {
        Alert.alert(
          'Face Registered!',
          'Your face has been registered. Please tap Check In again to complete your check-in.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        setIsProcessing(false);
        return;
      }

      // Face verified - proceed with check-in or check-out
      if (mode === 'checkin') {
        await performCheckIn();
      } else {
        await performCheckOut();
      }
    } catch (error) {
      console.error('[FaceVerification] Error:', error);
      Alert.alert('Error', 'Failed to verify face: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const performCheckIn = async () => {
    try {
      const res = await checkIn();
      await storeCheckIn();
      
      Alert.alert(
        'Check-in Successful!',
        'Your face has been verified and you are now checked in.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      const msg = getApiErrorMessage(error);
      Alert.alert('Check-in Failed', msg);
    }
  };

  const performCheckOut = async () => {
    try {
      await checkOut();
      await storeCheckOut();
      
      Alert.alert(
        'Check-out Successful!',
        'Your face has been verified and you are now checked out.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      const msg = getApiErrorMessage(error);
      Alert.alert('Check-out Failed', msg);
    }
  };

  return (
    <LinearGradient colors={grad.screen} style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: g.text }]}>
          {mode === 'checkin' ? 'Face Check-in' : 'Face Check-out'}
        </Text>
        <Text style={[styles.subtitle, { color: g.textMuted }]}>
          Verify your identity to {mode === 'checkin' ? 'check in' : 'check out'}
        </Text>
      </View>

      {/* Camera Preview */}
      <View style={[styles.cameraContainer, { borderColor: faceDetected ? g.mint : g.coral }]}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="front"
          onFacesDetected={handleFacesDetected}
          faceDetectorSettings={{
            mode: 'fast', // Better performance on low-end devices
            detectLandmarks: true,
            runClassifications: true,
            minDetectionInterval: 100, // Faster updates
            tracking: true,
          }}
        >
          {/* Face Guide Overlay */}
          <View style={styles.overlay}>
            {/* Static guide oval */}
            <View style={[styles.faceGuide, { borderColor: faceDetected ? g.mint : g.coral }]} />
            
            {/* Dynamic bounding box around detected face */}
            {faceBounds && (
              <View 
                style={[
                  styles.boundingBox,
                  {
                    left: faceBounds.origin.x,
                    top: faceBounds.origin.y,
                    width: faceBounds.size.width,
                    height: faceBounds.size.height,
                    borderColor: faceDetected ? g.mint : g.coral,
                  }
                ]} 
              />
            )}
            
            {/* Lighting indicator */}
            <View style={[styles.lightingIndicator, { 
              backgroundColor: lightingQuality === 'good' ? g.mint : 
                              lightingQuality === 'poor' ? g.coral : g.textDim
            }]}>
              <Text style={styles.lightingText}>
                {lightingQuality === 'good' ? '● Good lighting' : 
                 lightingQuality === 'poor' ? '● Poor lighting' : '● Checking...'}
              </Text>
            </View>
          </View>
        </CameraView>
      </View>

      {/* Status Message */}
      <View style={[styles.statusContainer, { backgroundColor: faceDetected ? g.mintSoft : g.coralSoft }]}>
        <Text style={[styles.statusText, { color: faceDetected ? g.mint : g.coral }]}>
          {faceMessage}
        </Text>
        {similarity > 0 && (
          <Text style={[styles.similarityText, { color: g.textMuted }]}>
            Match: {Math.round(similarity * 100)}%
          </Text>
        )}
      </View>

      {/* Verify Button */}
      <TouchableOpacity
        style={[
          styles.verifyButton,
          { backgroundColor: faceDetected ? (mode === 'checkin' ? g.mint : g.coral) : g.textDim },
          !faceDetected && styles.verifyButtonDisabled,
        ]}
        onPress={verifyAndProceed}
        disabled={!faceDetected || isProcessing}
      >
        {isProcessing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.verifyButtonText}>
            {mode === 'checkin' ? 'Verify & Check In' : 'Verify & Check Out'}
          </Text>
        )}
      </TouchableOpacity>

      {/* Cancel Button */}
      <TouchableOpacity
        style={[styles.cancelButton, { borderColor: g.border }]}
        onPress={() => navigation.goBack()}
        disabled={isProcessing}
      >
        <Text style={[styles.cancelButtonText, { color: g.textMuted }]}>Cancel</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 56,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
  },
  cameraContainer: {
    width: CAMERA_SIZE,
    height: CAMERA_SIZE,
    alignSelf: 'center',
    borderRadius: 20,
    borderWidth: 3,
    overflow: 'hidden',
    marginBottom: 20,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  faceGuide: {
    width: 200,
    height: 250,
    borderRadius: 100,
    borderWidth: 2,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  boundingBox: {
    position: 'absolute',
    borderWidth: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  lightingIndicator: {
    position: 'absolute',
    top: 20,
    right: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  lightingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  statusContainer: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  similarityText: {
    fontSize: 12,
    marginTop: 4,
  },
  verifyButton: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  verifyButtonDisabled: {
    opacity: 0.5,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  cancelButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  button: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
