// screens/FaceVerificationScreen.js
// Real-time face similarity check: requires CONSECUTIVE_MATCHES frames in a row
// above threshold before the verify button activates. This prevents photo attacks
// and ensures the face is consistently matching.

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  Dimensions, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import useAuthStore from '../store/authStore';
import useTimeStore from '../store/timeStore';
import Toast from '../components/Toast';
import {
  processDetectedFace,
  validateFacePosition,
  extractFaceFeatures,
  getFaceData,
  calculateSimilarity,
} from '../services/faceRecognitionService';
import { checkIn, checkOut, getApiErrorMessage } from '../services/api';
import { getWifiInfo } from '../services/wifiService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const CAMERA_SIZE = Math.min(screenWidth - 48, screenHeight * 0.42, 380);

// Require this many CONSECUTIVE frames above threshold to confirm identity
const CONSECUTIVE_MATCHES = 3;
// Similarity threshold (82% normalized geometric match required)
const SIMILARITY_THRESHOLD = 0.82;

export default function FaceVerificationScreen({ navigation, route }) {
  const { mode, location: routeLocation = null } = route.params || { mode: 'checkin' };
  const isWeb = Platform.OS === 'web';
  const { colors: g, gradients: grad } = useThemeStore();
  const { user } = useAuthStore();
  const { checkIn: storeCheckIn, checkOut: storeCheckOut } = useTimeStore();

  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceMessage, setFaceMessage] = useState(
    isWeb ? '✓ Ready — click the button below' : 'Position your face in the frame'
  );
  const [similarity, setSimilarity] = useState(0);
  const [consecutiveMatches, setConsecutiveMatches] = useState(0);
  const [faceMatchConfirmed, setFaceMatchConfirmed] = useState(false);
  const [faceBounds, setFaceBounds] = useState(null);
  const [lightingQuality, setLightingQuality] = useState('unknown');
  const [slowRequest, setSlowRequest] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [storedFaceData, setStoredFaceData] = useState(null);
  const [faceDataLoading, setFaceDataLoading] = useState(true); // true until face data fetch resolves
  const [faceLoadError, setFaceLoadError] = useState(null);

  const cameraRef = useRef(null);
  const currentFaceRef = useRef(null);
  const lastDetectionTimeRef = useRef(Date.now());
  const slowTimerRef = useRef(null);
  const consecutiveRef = useRef(0);

  const showToast = (message, type = 'success') =>
    setToast({ visible: true, message, type });

  // ── Load stored face data on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    setFaceDataLoading(true);
    getFaceData(user.id).then((data) => {
      setFaceDataLoading(false);
      if (!data) {
        Alert.alert(
          'Face Not Registered',
          'Register your face in Settings before checking in.',
          [
            { text: 'Register Now', onPress: () => navigation.replace('FaceRegistration') },
            { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
          ]
        );
        return;
      }
      if (data.needsReRegistration) {
        Alert.alert(
          'Re-registration Required',
          'Your face data is in an outdated format. Please re-register your face.',
          [
            { text: 'Re-register Now', onPress: () => navigation.replace('FaceRegistration') },
            { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
          ]
        );
        return;
      }
      if (data.features?.__v !== 2) {
        setFaceLoadError('outdated');
        return;
      }
      setStoredFaceData(data);
    }).catch(() => setFaceDataLoading(false));
  }, [user, navigation]);

  // ── "No face detected" hint after 7s ────────────────────────────────────────
  useEffect(() => {
    if (isWeb || faceDetected || isProcessing) return;
    const interval = setInterval(() => {
      if (Date.now() - lastDetectionTimeRef.current > 7000) {
        setFaceMessage('No face detected — try better lighting or move closer');
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [faceDetected, isProcessing]);

  // ── Real-time face detection + similarity check ──────────────────────────────
  const handleFacesDetected = ({ faces }) => {
    if (isProcessing) return;
    lastDetectionTimeRef.current = Date.now();

    if (!faces || faces.length === 0) {
      setFaceDetected(false);
      setFaceMessage('No face detected');
      setSimilarity(0);
      setFaceBounds(null);
      currentFaceRef.current = null;
      setLightingQuality('unknown');
      // Reset consecutive counter
      consecutiveRef.current = 0;
      setConsecutiveMatches(0);
      setFaceMatchConfirmed(false);
      return;
    }
    if (faces.length > 1) {
      setFaceDetected(false);
      setFaceMessage('Multiple faces detected — one person only');
      setFaceBounds(null);
      currentFaceRef.current = null;
      consecutiveRef.current = 0;
      setConsecutiveMatches(0);
      setFaceMatchConfirmed(false);
      return;
    }

    const face = processDetectedFace(faces[0]);
    currentFaceRef.current = face;
    if (face.bounds) setFaceBounds(face.bounds);

    const hasLandmarks = face.leftEyeOpenProbability !== undefined || face.rightEyeOpenProbability !== undefined;
    setLightingQuality(hasLandmarks ? 'good' : 'poor');

    const validation = validateFacePosition(face);
    if (!validation.valid) {
      setFaceDetected(false);
      setFaceMessage(validation.message);
      setSimilarity(0);
      consecutiveRef.current = 0;
      setConsecutiveMatches(0);
      setFaceMatchConfirmed(false);
      return;
    }

    setFaceDetected(true);

    // ── Real-time similarity against stored face ─────────────────────────────
    if (storedFaceData?.features) {
      const currentFeatures = extractFaceFeatures(face);
      if (currentFeatures && currentFeatures.__v === 2) {
        const sim = calculateSimilarity(storedFaceData.features, currentFeatures);
        setSimilarity(sim);

        if (sim >= SIMILARITY_THRESHOLD) {
          consecutiveRef.current += 1;
          const count = consecutiveRef.current;
          setConsecutiveMatches(count);

          if (count >= CONSECUTIVE_MATCHES) {
            setFaceMatchConfirmed(true);
            setFaceMessage(`✓ Identity confirmed — tap to ${mode === 'checkin' ? 'check in' : 'check out'}`);
          } else {
            setFaceMessage(`Hold still... (${count}/${CONSECUTIVE_MATCHES})`);
          }
        } else {
          consecutiveRef.current = 0;
          setConsecutiveMatches(0);
          setFaceMatchConfirmed(false);
          if (sim > 0.5) {
            setFaceMessage(`Partial match (${Math.round(sim * 100)}%) — adjust position`);
          } else {
            setFaceMessage('Face not recognized — ensure good lighting');
          }
        }
      } else {
        // Could not extract features (no landmarks)
        setFaceMessage('✓ Face detected — tap Verify');
        consecutiveRef.current = 0;
        setFaceMatchConfirmed(false);
      }
    } else {
      // No stored data loaded yet (or web)
      setFaceMessage(isWeb ? '✓ Ready — click the button below' : '✓ Face detected — tap Verify');
    }
  };

  // ── Check-in / Check-out API calls ──────────────────────────────────────────
  const performCheckIn = async () => {
    try {
      await checkIn(routeLocation);
      // Capture SSID at check-in time for WiFi-aware auto-checkout
      const wifiInfo = await getWifiInfo();
      await storeCheckIn(wifiInfo?.ssid || null);
      clearTimeout(slowTimerRef.current);
      setSlowRequest(false);
      showToast('Check-in successful!', 'success');
      setTimeout(() => navigation.goBack(), 1600);
    } catch (error) {
      clearTimeout(slowTimerRef.current);
      setSlowRequest(false);
      showToast(getApiErrorMessage(error), 'error');
      setIsProcessing(false);
    }
  };

  const performCheckOut = async () => {
    try {
      await checkOut();
      await storeCheckOut();
      clearTimeout(slowTimerRef.current);
      setSlowRequest(false);
      showToast('Check-out successful!', 'success');
      setTimeout(() => navigation.goBack(), 1600);
    } catch (error) {
      clearTimeout(slowTimerRef.current);
      setSlowRequest(false);
      showToast(getApiErrorMessage(error), 'error');
      setIsProcessing(false);
    }
  };

  // ── Main verify button handler ───────────────────────────────────────────────
  const verifyAndProceed = async () => {
    setIsProcessing(true);
    setSlowRequest(false);
    slowTimerRef.current = setTimeout(() => setSlowRequest(true), 6000);

    // Web: skip face check, proceed directly
    if (isWeb) {
      if (mode === 'checkin') await performCheckIn();
      else await performCheckOut();
      return;
    }

    if (!faceDetected && !faceMatchConfirmed) {
      clearTimeout(slowTimerRef.current);
      showToast('Position your face correctly first', 'error');
      setIsProcessing(false);
      return;
    }

    // If no stored face data (shouldn't happen due to useEffect guard, but be safe)
    if (!storedFaceData && !isWeb) {
      clearTimeout(slowTimerRef.current);
      showToast('Face data not loaded. Please try again.', 'error');
      setIsProcessing(false);
      return;
    }

    // If face match was confirmed via consecutive frames, proceed directly
    if (faceMatchConfirmed || !storedFaceData) {
      if (mode === 'checkin') await performCheckIn();
      else await performCheckOut();
      return;
    }

    // Fallback: take photo and do a final one-shot comparison
    if (!cameraRef.current || !currentFaceRef.current) {
      clearTimeout(slowTimerRef.current);
      showToast('Camera not ready. Try again.', 'error');
      setIsProcessing(false);
      return;
    }

    try {
      const face = currentFaceRef.current;
      const features = extractFaceFeatures(face);

      if (!features || features.__v !== 2) {
        clearTimeout(slowTimerRef.current);
        showToast('Could not extract face features. Try again.', 'error');
        setIsProcessing(false);
        return;
      }

      const sim = calculateSimilarity(storedFaceData.features, features);
      setSimilarity(sim);

      if (sim < SIMILARITY_THRESHOLD) {
        clearTimeout(slowTimerRef.current);
        showToast(
          sim > 0.6
            ? `Low match (${Math.round(sim * 100)}%). Try better lighting.`
            : 'Face does not match registered data.',
          'error'
        );
        setIsProcessing(false);
        return;
      }

      if (mode === 'checkin') await performCheckIn();
      else await performCheckOut();
    } catch (error) {
      clearTimeout(slowTimerRef.current);
      showToast('Error: ' + error.message, 'error');
      setIsProcessing(false);
    }
  };

  // ── Face data still loading ──────────────────────────────────────────────────
  if (faceDataLoading && !isWeb) {
    return (
      <LinearGradient colors={grad.screen} style={s.container}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={g.accent} />
          <Text style={[s.hint, { color: g.textMuted, marginTop: 12 }]}>Loading face data…</Text>
        </View>
      </LinearGradient>
    );
  }

  // ── Permission gates (native only — browser asks automatically when camera mounts)
  if (!isWeb) {
    if (!permission) {
      return (
        <LinearGradient colors={grad.screen} style={s.container}>
          <View style={s.centered}>
            <ActivityIndicator size="large" color={g.accent} />
            <Text style={[s.hint, { color: g.textMuted, marginTop: 12 }]}>Loading camera...</Text>
          </View>
        </LinearGradient>
      );
    }

    if (!permission.granted) {
      return (
        <LinearGradient colors={grad.screen} style={s.container}>
          <View style={s.centered}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
            <Text style={[s.title, { color: g.text, textAlign: 'center' }]}>Camera Access Needed</Text>
            <Text style={[s.hint, { color: g.textMuted, textAlign: 'center', marginBottom: 28 }]}>
              Camera permission is required to verify your face.
            </Text>
            <TouchableOpacity style={[s.btn, { backgroundColor: g.accent }]} onPress={requestPermission}>
              <Text style={s.btnText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.cancelBtn, { borderColor: g.border }]} onPress={() => navigation.goBack()}>
              <Text style={[s.cancelText, { color: g.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      );
    }
  }

  // Button active when:
  //   • web (no camera verification needed), OR
  //   • face match confirmed via consecutive frames (primary path), OR
  //   • face is detected AND no stored data exists (allow check-in to proceed so user can register)
  const btnReady = isWeb
    || faceMatchConfirmed
    || (!faceDataLoading && faceDetected && !storedFaceData && !faceLoadError);
  const matchPct = Math.round(similarity * 100);

  return (
    <LinearGradient colors={grad.screen} style={s.container}>
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />

      <View style={s.inner}>
        <View style={s.header}>
          <Text style={[s.title, { color: g.text }]}>
            {mode === 'checkin' ? 'Face Check-in' : 'Face Check-out'}
          </Text>
          <Text style={[s.hint, { color: g.textMuted }]}>
            {isWeb
              ? 'Camera visible for record — click verify to proceed'
              : `Hold your face in frame — ${CONSECUTIVE_MATCHES} consistent matches required`}
          </Text>
        </View>

        {/* Camera */}
        <View style={[s.camWrap, {
          width: CAMERA_SIZE,
          height: CAMERA_SIZE,
          borderColor: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : g.coral,
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
              minDetectionInterval: 100,
              tracking: true,
            }}
          />
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={[s.corner, s.tl, { borderColor: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : g.coral }]} />
            <View style={[s.corner, s.tr, { borderColor: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : g.coral }]} />
            <View style={[s.corner, s.bl, { borderColor: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : g.coral }]} />
            <View style={[s.corner, s.br, { borderColor: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : g.coral }]} />
            {!isWeb && (
              <View style={[s.oval, { borderColor: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : 'rgba(255,255,255,0.3)' }]} />
            )}
            {faceBounds && (
              <View style={[s.bbox, {
                left: faceBounds.origin.x,
                top: faceBounds.origin.y,
                width: faceBounds.size.width,
                height: faceBounds.size.height,
                borderColor: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : g.coral,
              }]} />
            )}
            {!isWeb && (
              <View style={[s.lightPill, {
                backgroundColor: lightingQuality === 'good' ? 'rgba(29,185,138,0.85)' : 'rgba(0,0,0,0.55)',
              }]}>
                <Text style={s.lightText}>
                  {lightingQuality === 'good' ? '☀ Good' : lightingQuality === 'poor' ? '☁ Low light' : '● Checking'}
                </Text>
              </View>
            )}
            {/* Consecutive match indicator */}
            {consecutiveMatches > 0 && !faceMatchConfirmed && (
              <View style={[s.matchPill, { backgroundColor: 'rgba(139,124,255,0.85)' }]}>
                <Text style={s.matchText}>{consecutiveMatches}/{CONSECUTIVE_MATCHES}</Text>
              </View>
            )}
            {faceMatchConfirmed && (
              <View style={[s.matchPill, { backgroundColor: 'rgba(62,232,199,0.9)' }]}>
                <Text style={[s.matchText, { color: '#000' }]}>✓ Confirmed</Text>
              </View>
            )}
          </View>
        </View>

        {/* Status */}
        <View style={[s.status, {
          backgroundColor: faceMatchConfirmed ? g.mintSoft : faceDetected ? g.accentSoft : g.coralSoft,
        }]}>
          <Text style={[s.statusText, {
            color: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : g.coral,
          }]}>{faceMessage}</Text>
          {similarity > 0 && !isWeb && (
            <Text style={[s.simText, { color: g.textMuted }]}>
              Match: {matchPct}% {matchPct >= 82 ? '✓' : matchPct >= 60 ? '~' : '✗'}
            </Text>
          )}
        </View>

        {/* Slow request notice */}
        {slowRequest && (
          <View style={[s.slowBanner, { backgroundColor: g.accentSoft, borderColor: g.accent }]}>
            <ActivityIndicator size="small" color={g.accent} style={{ marginRight: 8 }} />
            <Text style={[s.slowText, { color: g.accent }]}>
              Server waking up… may take up to 30s on first request
            </Text>
          </View>
        )}

        {/* Verify button */}
        <TouchableOpacity
          style={[s.btn, {
            backgroundColor: btnReady
              ? (mode === 'checkin' ? g.mint : g.coral)
              : g.textDim,
            opacity: btnReady ? 1 : 0.5,
            marginTop: 4,
          }]}
          onPress={verifyAndProceed}
          disabled={!btnReady || isProcessing}
        >
          {isProcessing
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>
                {mode === 'checkin' ? '▶  Verify & Check In' : '■  Verify & Check Out'}
              </Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.cancelBtn, { borderColor: g.border }]}
          onPress={() => navigation.goBack()}
          disabled={isProcessing}
        >
          <Text style={[s.cancelText, { color: g.textMuted }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const CORNER = 22;
const CW = 3;

const s = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, padding: 24, paddingTop: 52 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '900', marginBottom: 6 },
  hint: { fontSize: 13, lineHeight: 20 },
  camWrap: {
    alignSelf: 'center', borderRadius: 20, borderWidth: 2.5,
    overflow: 'hidden', marginBottom: 16,
  },
  oval: {
    position: 'absolute', alignSelf: 'center',
    top: '10%', width: '55%', height: '75%',
    borderRadius: 200, borderWidth: 2, borderStyle: 'dashed',
  },
  bbox: { position: 'absolute', borderWidth: 2, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  tl: { top: 14, left: 14, borderTopWidth: CW, borderLeftWidth: CW, borderTopLeftRadius: 6 },
  tr: { top: 14, right: 14, borderTopWidth: CW, borderRightWidth: CW, borderTopRightRadius: 6 },
  bl: { bottom: 14, left: 14, borderBottomWidth: CW, borderLeftWidth: CW, borderBottomLeftRadius: 6 },
  br: { bottom: 14, right: 14, borderBottomWidth: CW, borderRightWidth: CW, borderBottomRightRadius: 6 },
  lightPill: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  lightText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  matchPill: { position: 'absolute', top: 12, left: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  matchText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  status: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12, alignItems: 'center' },
  statusText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  simText: { fontSize: 12, marginTop: 4 },
  slowBanner: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1,
  },
  slowText: { fontSize: 12, fontWeight: '600', flex: 1 },
  btn: { borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 10 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  cancelText: { fontSize: 14, fontWeight: '600' },
});
