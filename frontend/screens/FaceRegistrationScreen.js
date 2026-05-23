// screens/FaceRegistrationScreen.js
// Multi-sample face registration — collects 5 valid frames and averages
// the normalized feature ratios for a robust reference template.

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  averageFeatures,
  saveFaceData,
  hasFaceData,
} from '../services/faceRecognitionService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const CAMERA_SIZE = Math.min(screenWidth - 48, screenHeight * 0.42, 380);
const isWeb = Platform.OS === 'web';

const REQUIRED_SAMPLES = 5;         // frames to collect for averaging
const SAMPLE_INTERVAL_MS = 700;     // ms between auto-collected samples

export default function FaceRegistrationScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const { user } = useAuthStore();
  const [permission, requestPermission] = useCameraPermissions();

  // Stage: 'camera' → 'preview' → (save)
  const [stage, setStage] = useState('camera');
  const [isRegistering, setIsRegistering] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceMessage, setFaceMessage] = useState(
    isWeb ? 'Ready — click Capture when ready' : 'Position your face in the oval'
  );
  const [faceBounds, setFaceBounds] = useState(null);
  const [lightingQuality, setLightingQuality] = useState('unknown');

  // Multi-sample collection
  const [sampleCount, setSampleCount] = useState(0);
  const [isCollecting, setIsCollecting] = useState(false);

  const [capturedUri, setCapturedUri] = useState(null);
  const [capturedFeatures, setCapturedFeatures] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const cameraRef = useRef(null);
  const currentFaceRef = useRef(null);
  const lastDetectionRef = useRef(Date.now());
  const samplesRef = useRef([]);
  const sampleTimerRef = useRef(null);
  const isCollectingRef = useRef(false);

  const showToast = (message, type = 'success') => setToast({ visible: true, message, type });

  useEffect(() => {
    if (!user?.id) return;
    hasFaceData(user.id).then((hasData) => {
      if (hasData) {
        Alert.alert(
          'Face Already Registered',
          'Re-registering will replace your existing face data.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
            { text: 'Re-register' },
          ]
        );
      }
    });
  }, [user, navigation]);

  // Timeout hint if no face detected
  useEffect(() => {
    if (isWeb || stage !== 'camera') return;
    const interval = setInterval(() => {
      if (!faceDetected && Date.now() - lastDetectionRef.current > 7000) {
        setFaceMessage('No face detected — try better lighting or move closer');
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [faceDetected, stage]);

  // ── Auto-collect samples when face is valid ─────────────────────────────────
  const startCollecting = useCallback(() => {
    if (isCollectingRef.current) return;
    isCollectingRef.current = true;
    setIsCollecting(true);

    const collectSample = () => {
      if (!isCollectingRef.current) return;
      const face = currentFaceRef.current;
      if (!face) return;
      const validation = validateFacePosition(face);
      if (!validation.valid) return;

      const features = extractFaceFeatures(face);
      if (features) {
        samplesRef.current.push(features);
        const count = samplesRef.current.length;
        setSampleCount(count);
        console.log(`[Registration] Sample ${count}/${REQUIRED_SAMPLES} collected`);

        if (count >= REQUIRED_SAMPLES) {
          stopCollecting();
          finalizeCapture();
        }
      }
    };

    sampleTimerRef.current = setInterval(collectSample, SAMPLE_INTERVAL_MS);
  }, []);

  const stopCollecting = () => {
    isCollectingRef.current = false;
    setIsCollecting(false);
    if (sampleTimerRef.current) {
      clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
  };

  useEffect(() => () => stopCollecting(), []); // cleanup on unmount

  const finalizeCapture = async () => {
    // Average all collected samples
    const averaged = averageFeatures(samplesRef.current);
    if (!averaged) {
      showToast('Could not build face profile. Try again.', 'error');
      resetCamera();
      return;
    }

    // Take one photo for the preview image
    let photoUri = null;
    try {
      if (cameraRef.current) {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false });
        photoUri = photo.uri;
      }
    } catch (_) {/* ignore photo error — features are what matter */}

    setCapturedFeatures(averaged);
    setCapturedUri(photoUri);
    setStage('preview');
  };

  // ── Face detection handler ──────────────────────────────────────────────────
  const handleFacesDetected = ({ faces }) => {
    if (stage !== 'camera') return;
    lastDetectionRef.current = Date.now();

    if (!faces || faces.length === 0) {
      setFaceDetected(false);
      setFaceMessage('No face detected');
      setFaceBounds(null);
      currentFaceRef.current = null;
      setLightingQuality('unknown');
      if (isCollectingRef.current) stopCollecting();
      return;
    }
    if (faces.length > 1) {
      setFaceDetected(false);
      setFaceMessage('Multiple faces detected — one person only');
      setFaceBounds(null);
      currentFaceRef.current = null;
      if (isCollectingRef.current) stopCollecting();
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
      if (isCollectingRef.current) {
        setFaceMessage(`Collecting... ${sampleCount}/${REQUIRED_SAMPLES} — hold still`);
      } else {
        setFaceMessage('✓ Face detected — tap Capture to begin');
      }
    } else {
      setFaceDetected(false);
      setFaceMessage(validation.message);
      if (isCollectingRef.current) stopCollecting();
    }
  };

  // ── Manual capture button ───────────────────────────────────────────────────
  const handleCapture = async () => {
    if (isWeb) {
      // On web — simulate with no face data
      setCapturedFeatures({ __v: 2, ratios: {}, sampleCount: 0 });
      setCapturedUri(null);
      setStage('preview');
      return;
    }
    if (!faceDetected || !currentFaceRef.current) {
      showToast('Position your face correctly first', 'error');
      return;
    }
    // Reset sample buffer and start collecting
    samplesRef.current = [];
    setSampleCount(0);
    startCollecting();
  };

  const handleRetake = () => {
    stopCollecting();
    samplesRef.current = [];
    setSampleCount(0);
    setCapturedUri(null);
    setCapturedFeatures(null);
    setStage('camera');
    setFaceDetected(false);
    lastDetectionRef.current = Date.now();
    setFaceMessage(isWeb ? 'Ready — click Capture when ready' : 'Position your face in the oval');
  };

  const resetCamera = () => {
    stopCollecting();
    samplesRef.current = [];
    setSampleCount(0);
    setFaceDetected(false);
    setStage('camera');
    setFaceMessage('Position your face in the oval');
  };

  const handleSaveRegistration = async () => {
    setIsRegistering(true);
    try {
      if (!capturedFeatures || capturedFeatures.__v !== 2) {
        showToast('Invalid face data. Please retake.', 'error');
        setIsRegistering(false);
        return;
      }
      await saveFaceData(user.id, capturedFeatures, capturedUri);
      showToast('Face registered successfully!', 'success');
      setTimeout(() => navigation.goBack(), 1500);
    } catch (err) {
      showToast('Failed to save face data. Try again.', 'error');
      setIsRegistering(false);
    }
  };

  // ── Permission gates ────────────────────────────────────────────────────────
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

  // ── Progress bar for sample collection ─────────────────────────────────────
  const progressPct = Math.min(sampleCount / REQUIRED_SAMPLES, 1);

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
            {stage === 'preview' ? 'Confirm Registration' : 'Register Your Face'}
          </Text>
          <Text style={[styles.hint, { color: g.textMuted }]}>
            {stage === 'preview'
              ? `${capturedFeatures?.sampleCount || 0} samples captured — save to register`
              : 'We collect 5 frames for a robust match. Hold still in good lighting.'}
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
            {/* Camera view */}
            <View style={[styles.camWrap, {
              width: CAMERA_SIZE,
              height: CAMERA_SIZE,
              borderColor: (faceDetected || isWeb) ? (isCollecting ? g.accent : g.mint) : g.coral,
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
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <View style={[styles.corner, styles.tl, { borderColor: (faceDetected || isWeb) ? g.mint : g.coral }]} />
                <View style={[styles.corner, styles.tr, { borderColor: (faceDetected || isWeb) ? g.mint : g.coral }]} />
                <View style={[styles.corner, styles.bl, { borderColor: (faceDetected || isWeb) ? g.mint : g.coral }]} />
                <View style={[styles.corner, styles.br, { borderColor: (faceDetected || isWeb) ? g.mint : g.coral }]} />
                {!isWeb && (
                  <View style={[styles.oval, { borderColor: faceDetected ? g.mint : 'rgba(255,255,255,0.3)' }]} />
                )}
                {faceBounds && (
                  <View style={[styles.bbox, {
                    left: faceBounds.origin.x,
                    top: faceBounds.origin.y,
                    width: faceBounds.size.width,
                    height: faceBounds.size.height,
                    borderColor: faceDetected ? g.mint : g.coral,
                  }]} />
                )}
                {!isWeb && (
                  <View style={[styles.lightPill, {
                    backgroundColor: lightingQuality === 'good' ? 'rgba(29,185,138,0.85)' : 'rgba(0,0,0,0.55)',
                  }]}>
                    <Text style={styles.lightText}>
                      {lightingQuality === 'good' ? '☀ Good lighting' : lightingQuality === 'poor' ? '☁ Low lighting' : '● Checking...'}
                    </Text>
                  </View>
                )}
                {/* Sample count overlay */}
                {isCollecting && (
                  <View style={styles.sampleOverlay}>
                    <Text style={styles.sampleCount}>{sampleCount}/{REQUIRED_SAMPLES}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Sample progress bar */}
            {(isCollecting || sampleCount > 0) && (
              <View style={[styles.progressWrap, { backgroundColor: g.glass, borderColor: g.border }]}>
                <View style={[styles.progressBar, {
                  width: `${progressPct * 100}%`,
                  backgroundColor: sampleCount >= REQUIRED_SAMPLES ? g.mint : g.accent,
                }]} />
              </View>
            )}

            {/* Status */}
            <View style={[styles.status, { backgroundColor: (faceDetected || isWeb) ? g.mintSoft : g.coralSoft }]}>
              <Text style={[styles.statusText, { color: (faceDetected || isWeb) ? g.mint : g.coral }]}>
                {isCollecting ? `Collecting sample ${sampleCount}/${REQUIRED_SAMPLES} — hold still` : faceMessage}
              </Text>
            </View>

            {!isWeb && (
              <View style={styles.tips}>
                <Text style={[styles.tipText, { color: g.textMuted }]}>
                  Face camera directly · Good lighting · One person only
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.btn, {
                backgroundColor: (faceDetected || isWeb) && !isCollecting ? g.mint : g.textDim,
                opacity: (faceDetected || isWeb) && !isCollecting ? 1 : 0.5,
              }]}
              onPress={handleCapture}
              disabled={(!faceDetected && !isWeb) || isCollecting}
            >
              {isCollecting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>📷  Start Capture ({REQUIRED_SAMPLES} samples)</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Preview */}
            {capturedUri ? (
              <View style={[styles.previewWrap, { width: CAMERA_SIZE, height: CAMERA_SIZE, borderColor: g.mint }]}>
                <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <View style={[styles.corner, styles.tl, { borderColor: g.mint }]} />
                <View style={[styles.corner, styles.tr, { borderColor: g.mint }]} />
                <View style={[styles.corner, styles.bl, { borderColor: g.mint }]} />
                <View style={[styles.corner, styles.br, { borderColor: g.mint }]} />
              </View>
            ) : (
              <View style={[styles.previewWrap, {
                width: CAMERA_SIZE, height: CAMERA_SIZE * 0.5,
                borderColor: g.mint, alignItems: 'center', justifyContent: 'center',
              }]}>
                <Text style={{ fontSize: 48, marginBottom: 8 }}>✅</Text>
                <Text style={[styles.hint, { color: g.mint, textAlign: 'center' }]}>
                  {capturedFeatures?.sampleCount || 0} samples captured
                </Text>
              </View>
            )}

            {/* Registration quality summary */}
            <LinearGradient
              colors={['rgba(62,232,199,0.08)', 'rgba(62,232,199,0.02)']}
              style={[styles.qualityCard, { borderColor: 'rgba(62,232,199,0.3)' }]}
            >
              <Text style={{ color: g.mint, fontWeight: '800', fontSize: 14, marginBottom: 6 }}>
                ✓ Registration Quality
              </Text>
              <Text style={{ color: g.textMuted, fontSize: 12 }}>
                • {capturedFeatures?.sampleCount || 0} face samples averaged
              </Text>
              <Text style={{ color: g.textMuted, fontSize: 12 }}>
                • {Object.keys(capturedFeatures?.ratios || {}).length} facial measurements stored
              </Text>
              <Text style={{ color: g.textMuted, fontSize: 12 }}>
                • Scale-invariant recognition active
              </Text>
            </LinearGradient>

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
              <Text style={[styles.cancelText, { color: g.textMuted }]}>↺  Retake</Text>
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
    alignSelf: 'center', borderRadius: 20, borderWidth: 2,
    overflow: 'hidden', marginBottom: 12,
  },
  previewWrap: {
    alignSelf: 'center', borderRadius: 20, borderWidth: 2,
    overflow: 'hidden', marginBottom: 14,
  },
  oval: {
    position: 'absolute', alignSelf: 'center',
    top: '10%', width: '55%', height: '75%',
    borderRadius: 200, borderWidth: 2, borderStyle: 'dashed',
  },
  bbox: { position: 'absolute', borderWidth: 2, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  tl: { top: 14, left: 14, borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W, borderTopLeftRadius: 6 },
  tr: { top: 14, right: 14, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W, borderTopRightRadius: 6 },
  bl: { bottom: 14, left: 14, borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W, borderBottomLeftRadius: 6 },
  br: { bottom: 14, right: 14, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W, borderBottomRightRadius: 6 },
  lightPill: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  lightText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  sampleOverlay: {
    position: 'absolute', bottom: 12, left: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 12,
  },
  sampleCount: { color: '#fff', fontSize: 16, fontWeight: '900' },
  progressWrap: {
    height: 6, borderRadius: 3, borderWidth: 1,
    marginBottom: 10, overflow: 'hidden', marginHorizontal: 4,
  },
  progressBar: { height: '100%', borderRadius: 3 },
  status: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 14, alignItems: 'center' },
  statusText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  tips: { marginBottom: 14 },
  tipText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  qualityCard: { borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, gap: 4 },
  btn: { borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 10 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, marginBottom: 8 },
  cancelText: { fontSize: 14, fontWeight: '600' },
});
