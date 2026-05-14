import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  Dimensions, Platform, ScrollView, Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import useAuthStore from '../store/authStore';
import Toast from '../components/Toast';
import {
  processDetectedFace,
  validateFacePosition,
  extractFaceFeatures,
  saveFaceData,
  hasFaceData,
} from '../services/faceRecognitionService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const CAMERA_SIZE = Math.min(screenWidth - 48, screenHeight * 0.42, 380);
const isWeb = Platform.OS === 'web';

export default function FaceRegistrationScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const { user } = useAuthStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState('camera'); // 'camera' | 'preview'
  const [isRegistering, setIsRegistering] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceMessage, setFaceMessage] = useState(
    isWeb ? 'Ready — click Capture when ready' : 'Position your face in the oval'
  );
  const [faceBounds, setFaceBounds] = useState(null);
  const [lightingQuality, setLightingQuality] = useState('unknown');
  const [capturedUri, setCapturedUri] = useState(null);
  const [capturedFeatures, setCapturedFeatures] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const cameraRef = useRef(null);
  const currentFaceRef = useRef(null);
  const lastDetectionRef = useRef(Date.now());

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
  };

  useEffect(() => {
    if (!user?.id) return;
    hasFaceData(user.id).then((hasData) => {
      if (hasData) {
        Alert.alert(
          'Face Already Registered',
          'Re-register to update your face data.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
            { text: 'Re-register' },
          ]
        );
      }
    });
  }, [user, navigation]);

  // Timeout: if no face detected after 7s, show hint
  useEffect(() => {
    if (isWeb || stage !== 'camera') return;
    const interval = setInterval(() => {
      if (!faceDetected && Date.now() - lastDetectionRef.current > 7000) {
        setFaceMessage('No face detected — try better lighting or move closer');
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [faceDetected, stage]);

  const handleFacesDetected = ({ faces }) => {
    if (stage !== 'camera') return;
    lastDetectionRef.current = Date.now();

    if (!faces || faces.length === 0) {
      setFaceDetected(false);
      setFaceMessage('No face detected');
      setFaceBounds(null);
      currentFaceRef.current = null;
      setLightingQuality('unknown');
      return;
    }
    if (faces.length > 1) {
      setFaceDetected(false);
      setFaceMessage('Multiple faces — only one person please');
      setFaceBounds(null);
      currentFaceRef.current = null;
      return;
    }

    const face = processDetectedFace(faces[0]);
    currentFaceRef.current = face;
    if (face.bounds) setFaceBounds(face.bounds);

    const hasLandmarks = face.leftEyeOpenProbability !== undefined || face.rightEyeOpenProbability !== undefined;
    setLightingQuality(hasLandmarks ? 'good' : 'poor');

    const validation = validateFacePosition(face);
    if (validation.valid) {
      setFaceDetected(true);
      setFaceMessage('✓ Hold still — tap Capture');
    } else {
      setFaceDetected(false);
      setFaceMessage(validation.message);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: false });
      let features = null;
      if (!isWeb && currentFaceRef.current) {
        features = extractFaceFeatures(currentFaceRef.current);
      }
      setCapturedUri(photo.uri);
      setCapturedFeatures(features);
      setStage('preview');
    } catch (err) {
      showToast('Could not capture photo. Try again.', 'error');
    }
  };

  const handleRetake = () => {
    setCapturedUri(null);
    setCapturedFeatures(null);
    setStage('camera');
    setFaceDetected(false);
    lastDetectionRef.current = Date.now();
    setFaceMessage(isWeb ? 'Ready — click Capture when ready' : 'Position your face in the oval');
  };

  const handleSaveRegistration = async () => {
    setIsRegistering(true);
    try {
      await saveFaceData(user.id, capturedFeatures || {}, capturedUri);
      showToast('Face registered successfully!', 'success');
      setTimeout(() => navigation.goBack(), 1500);
    } catch (err) {
      showToast('Failed to save face data. Try again.', 'error');
    } finally {
      setIsRegistering(false);
    }
  };

  if (!permission) {
    return (
      <LinearGradient colors={grad.screen} style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={g.accent} />
          <Text style={[styles.hint, { color: g.textMuted, marginTop: 12 }]}>Loading camera...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!permission.granted) {
    return (
      <LinearGradient colors={grad.screen} style={styles.container}>
        <View style={styles.centered}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
          <Text style={[styles.title, { color: g.text, textAlign: 'center' }]}>Camera Access Needed</Text>
          <Text style={[styles.hint, { color: g.textMuted, textAlign: 'center', marginBottom: 28 }]}>
            Camera permission is required to register your face.
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: g.accent }]} onPress={requestPermission}>
            <Text style={styles.btnText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cancelBtn, { borderColor: g.border }]} onPress={() => navigation.goBack()}>
            <Text style={[styles.cancelText, { color: g.textMuted }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={grad.screen} style={styles.container}>
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: g.text }]}>
            {stage === 'preview' ? 'Confirm Your Photo' : 'Register Your Face'}
          </Text>
          <Text style={[styles.hint, { color: g.textMuted }]}>
            {stage === 'preview'
              ? 'Does this look good? Save or retake.'
              : 'This photo is used to verify your identity at check-in'}
          </Text>
        </View>

        {/* Step indicator */}
        <View style={styles.stepRow}>
          <View style={[styles.stepDot, { backgroundColor: g.accent }]} />
          <View style={[styles.stepLine, { backgroundColor: stage === 'preview' ? g.accent : g.border }]} />
          <View style={[styles.stepDot, { backgroundColor: stage === 'preview' ? g.accent : g.border }]} />
        </View>

        {stage === 'camera' ? (
          <>
            {/* Camera */}
            <View style={[styles.camWrap, {
              width: CAMERA_SIZE,
              height: CAMERA_SIZE,
              borderColor: faceDetected || isWeb ? g.mint : g.coral,
            }]}>
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="front"
                onFacesDetected={isWeb ? undefined : handleFacesDetected}
                faceDetectorSettings={isWeb ? undefined : {
                  mode: 'fast',
                  detectLandmarks: true,
                  runClassifications: true,
                  minDetectionInterval: 150,
                  tracking: true,
                }}
              />
              {/* Overlay */}
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                {/* Corner brackets */}
                <View style={[styles.corner, styles.tl, { borderColor: faceDetected || isWeb ? g.mint : g.coral }]} />
                <View style={[styles.corner, styles.tr, { borderColor: faceDetected || isWeb ? g.mint : g.coral }]} />
                <View style={[styles.corner, styles.bl, { borderColor: faceDetected || isWeb ? g.mint : g.coral }]} />
                <View style={[styles.corner, styles.br, { borderColor: faceDetected || isWeb ? g.mint : g.coral }]} />
                {/* Oval guide */}
                {!isWeb && (
                  <View style={[styles.oval, { borderColor: faceDetected ? g.mint : 'rgba(255,255,255,0.3)' }]} />
                )}
                {/* Bounding box */}
                {faceBounds && (
                  <View style={[styles.bbox, {
                    left: faceBounds.origin.x,
                    top: faceBounds.origin.y,
                    width: faceBounds.size.width,
                    height: faceBounds.size.height,
                    borderColor: faceDetected ? g.mint : g.coral,
                  }]} />
                )}
                {/* Lighting pill */}
                {!isWeb && (
                  <View style={[styles.lightPill, {
                    backgroundColor: lightingQuality === 'good' ? 'rgba(29,185,138,0.85)' : 'rgba(0,0,0,0.55)',
                  }]}>
                    <Text style={styles.lightText}>
                      {lightingQuality === 'good' ? '☀ Good lighting' : lightingQuality === 'poor' ? '☁ Low lighting' : '● Checking...'}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Status message */}
            <View style={[styles.status, { backgroundColor: (faceDetected || isWeb) ? g.mintSoft : g.coralSoft }]}>
              <Text style={[styles.statusText, { color: (faceDetected || isWeb) ? g.mint : g.coral }]}>
                {faceMessage}
              </Text>
            </View>

            {!isWeb && (
              <View style={styles.tips}>
                <Text style={[styles.tipText, { color: g.textMuted }]}>
                  Face the camera directly · Good lighting · One person only
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: (faceDetected || isWeb) ? g.mint : g.textDim, opacity: (faceDetected || isWeb) ? 1 : 0.5 }]}
              onPress={handleCapture}
              disabled={(!faceDetected && !isWeb)}
            >
              <Text style={styles.btnText}>📷  Capture Photo</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Preview */}
            <View style={[styles.previewWrap, { width: CAMERA_SIZE, height: CAMERA_SIZE, borderColor: g.mint }]}>
              <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              {/* Corner brackets */}
              <View style={[styles.corner, styles.tl, { borderColor: g.mint }]} />
              <View style={[styles.corner, styles.tr, { borderColor: g.mint }]} />
              <View style={[styles.corner, styles.bl, { borderColor: g.mint }]} />
              <View style={[styles.corner, styles.br, { borderColor: g.mint }]} />
            </View>

            <View style={[styles.status, { backgroundColor: g.mintSoft }]}>
              <Text style={[styles.statusText, { color: g.mint }]}>✓ Photo captured — looks good?</Text>
            </View>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: isRegistering ? g.textDim : g.mint }]}
              onPress={handleSaveRegistration}
              disabled={isRegistering}
            >
              {isRegistering
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>✓  Save & Register</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: g.border }]}
              onPress={handleRetake}
              disabled={isRegistering}
            >
              <Text style={[styles.cancelText, { color: g.textMuted }]}>↺  Retake Photo</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: g.border, marginTop: 8 }]}
          onPress={() => navigation.goBack()}
          disabled={isRegistering}
        >
          <Text style={[styles.cancelText, { color: g.textMuted }]}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const CORNER = 22;
const CORNER_W = 3;

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingTop: 52, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '900', marginBottom: 6 },
  hint: { fontSize: 13, lineHeight: 20 },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  stepDot: { width: 10, height: 10, borderRadius: 5 },
  stepLine: { flex: 1, height: 2, marginHorizontal: 6 },
  camWrap: {
    alignSelf: 'center',
    borderRadius: 20,
    borderWidth: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  previewWrap: {
    alignSelf: 'center',
    borderRadius: 20,
    borderWidth: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  oval: {
    position: 'absolute',
    alignSelf: 'center',
    top: '10%',
    width: '55%',
    height: '75%',
    borderRadius: 200,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  bbox: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: '#fff',
  },
  tl: { top: 14, left: 14, borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W, borderTopLeftRadius: 6 },
  tr: { top: 14, right: 14, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W, borderTopRightRadius: 6 },
  bl: { bottom: 14, left: 14, borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W, borderBottomLeftRadius: 6 },
  br: { bottom: 14, right: 14, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W, borderBottomRightRadius: 6 },
  lightPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  lightText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  status: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
    alignItems: 'center',
  },
  statusText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  tips: { marginBottom: 16 },
  tipText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  btn: {
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 8,
  },
  cancelText: { fontSize: 14, fontWeight: '600' },
});
