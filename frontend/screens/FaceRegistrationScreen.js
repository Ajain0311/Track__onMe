// screens/FaceRegistrationScreen.js
// Screen for registering face data for first-time users

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  Dimensions, Platform
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import useAuthStore from '../store/authStore';
import {
  processDetectedFace,
  validateFacePosition,
  extractFaceFeatures,
  saveFaceData,
  hasFaceData,
} from '../services/faceRecognitionService';

const { width: screenWidth } = Dimensions.get('window');
const CAMERA_SIZE = Math.min(screenWidth - 48, 400);

export default function FaceRegistrationScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const { user } = useAuthStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [isRegistering, setIsRegistering] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceMessage, setFaceMessage] = useState('Position your face in the frame');
  const [guidanceType, setGuidanceType] = useState('no_face');
  const [faceBounds, setFaceBounds] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [lightingQuality, setLightingQuality] = useState('unknown');
  const cameraRef = useRef(null);

  // Store current face data for capture - MUST be before any early returns
  const currentFaceRef = useRef(null);
  const lastDetectionTimeRef = useRef(Date.now());

  // Check if already registered - must be before early returns
  useEffect(() => {
    const checkExistingRegistration = async () => {
      if (user?.id) {
        const hasData = await hasFaceData(user.id);
        if (hasData) {
          Alert.alert(
            'Face Already Registered',
            'You have already registered your face. Do you want to re-register?',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
              { text: 'Re-register', onPress: () => {} },
            ]
          );
        }
      }
    };
    checkExistingRegistration();
  }, [user, navigation]);

  // Check for detection timeout - must be before early returns
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const timeSinceLastDetection = Date.now() - lastDetectionTimeRef.current;
      if (timeSinceLastDetection > 5000 && !faceDetected) {
        setFaceMessage('Camera detection slow. Try adjusting lighting...');
        setGuidanceType('poor_lighting');
      }
    }, 2000);
    
    return () => clearInterval(checkInterval);
  }, [faceDetected]);

  // Handle face detection from camera stream - defined before early returns
  const handleFacesDetected = ({ faces }) => {
    lastDetectionTimeRef.current = Date.now();
    
    if (faces.length === 0) {
      setFaceDetected(false);
      setFaceMessage('No face detected');
      setGuidanceType('no_face');
      setFaceBounds(null);
      currentFaceRef.current = null;
      setLightingQuality('unknown');
      return;
    }

    if (faces.length > 1) {
      setFaceDetected(false);
      setFaceMessage('Multiple faces detected');
      setGuidanceType('multiple_faces');
      setFaceBounds(null);
      currentFaceRef.current = null;
      return;
    }

    const face = processDetectedFace(faces[0]);
    currentFaceRef.current = face;
    
    // Estimate lighting quality based on face detection confidence
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
      setFaceMessage('✓ Hold still and tap Capture');
    } else {
      setFaceDetected(false);
      setFaceMessage(validation.message);
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
            We need camera access to capture your face for attendance verification.
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

  // Capture and register face
  const captureAndRegister = async () => {
    if (!cameraRef.current || !faceDetected || !currentFaceRef.current) {
      Alert.alert('Error', 'Please position your face correctly before capturing.');
      return;
    }

    setIsRegistering(true);

    try {
      // Take picture
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });

      // Use the face data from the live detection (already validated)
      const face = currentFaceRef.current;

      // Extract features
      const faceFeatures = extractFaceFeatures(face);

      if (!faceFeatures) {
        Alert.alert('Error', 'Failed to extract face features. Please try again.');
        setIsRegistering(false);
        return;
      }

      // Save face data
      await saveFaceData(user.id, faceFeatures, photo.uri);

      Alert.alert(
        'Success!',
        'Your face has been registered successfully. You can now use face recognition for check-in/out.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('[FaceRegistration] Error:', error);
      Alert.alert('Error', 'Failed to register face: ' + error.message);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <LinearGradient colors={grad.screen} style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: g.text }]}>Register Your Face</Text>
        <Text style={[styles.subtitle, { color: g.textMuted }]}>
          This will be used for check-in and check-out verification
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
            mode: 'fast', // Changed from 'accurate' for better performance on low-end devices
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
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={[styles.instructionText, { color: g.textMuted }]}>
          • Face the camera directly{'\n'}
          • Ensure good lighting{'\n'}
          • Remove glasses if possible{'\n'}
          • Keep a neutral expression
        </Text>
      </View>

      {/* Capture Button */}
      <TouchableOpacity
        style={[
          styles.captureButton,
          { backgroundColor: faceDetected ? g.mint : g.textDim },
          !faceDetected && styles.captureButtonDisabled,
        ]}
        onPress={captureAndRegister}
        disabled={!faceDetected || isRegistering}
      >
        {isRegistering ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.captureButtonText}>Capture & Register</Text>
        )}
      </TouchableOpacity>

      {/* Cancel Button */}
      <TouchableOpacity
        style={[styles.cancelButton, { borderColor: g.border }]}
        onPress={() => navigation.goBack()}
        disabled={isRegistering}
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
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  instructions: {
    marginBottom: 24,
  },
  instructionText: {
    fontSize: 13,
    lineHeight: 22,
  },
  captureButton: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonText: {
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
