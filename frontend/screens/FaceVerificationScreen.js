// screens/FaceVerificationScreen.js
//
// SECURITY MODEL:
//   Native (iOS/Android):
//     1. Camera detects face and extracts geometric feature ratios (local pre-screen)
//     2. After CONSECUTIVE_MATCHES frames above threshold, POST /api/face/verify
//        → Backend compares against stored features in DB
//        → If pass, returns a signed faceToken (2-minute TTL)
//     3. faceToken is included in POST /api/checkin or POST /api/checkout
//     4. Backend validates token before writing attendance record
//
//   Web:
//     1. User enters their account password
//     2. POST /api/face/verify-web (backend re-authenticates via Supabase)
//        → If correct, returns a signed faceToken (2-minute TTL)
//     3. faceToken is included in POST /api/checkin or POST /api/checkout
//     4. Backend validates token before writing attendance record
//
//   NO BYPASS: check-in/out is rejected by the backend without a valid faceToken.

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  Dimensions, Platform, Linking, TextInput,
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
  detectFacesFromImage,
} from '../services/faceRecognitionService';
import {
  checkIn, checkOut,
  verifyFaceWithServer, verifyWebWithServer,
  getApiErrorMessage,
} from '../services/api';
import { getWifiInfo } from '../services/wifiService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const CAMERA_SIZE = Math.min(screenWidth - 48, screenHeight * 0.42, 380);

// Require this many CONSECUTIVE frames above threshold before triggering server check
const CONSECUTIVE_MATCHES = 3;
// Local pre-screen threshold — same value used on the server
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
    isWeb
      ? 'Confirm your identity with your account password'
      : 'Position your face in the frame'
  );

  // Web second factor
  const [webPassword, setWebPassword] = useState('');
  const [webPasswordShow, setWebPasswordShow] = useState(false);

  // Native face state
  const [similarity, setSimilarity] = useState(0);
  const [consecutiveMatches, setConsecutiveMatches] = useState(0);
  const [faceMatchConfirmed, setFaceMatchConfirmed] = useState(false);
  const [faceBounds, setFaceBounds] = useState(null);
  const [lightingQuality, setLightingQuality] = useState('unknown');
  const [slowRequest, setSlowRequest] = useState(false);

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [storedFaceData, setStoredFaceData] = useState(null);
  const [faceDataLoading, setFaceDataLoading] = useState(true);

  const [isCameraReady, setIsCameraReady] = useState(false);

  const cameraRef = useRef(null);
  const currentFaceRef = useRef(null);
  const lastDetectionTimeRef = useRef(Date.now());
  const slowTimerRef = useRef(null);
  const consecutiveRef = useRef(0);
  const pollActiveRef = useRef(false);

  const showToast = (message, type = 'success') =>
    setToast({ visible: true, message, type });

  // ── Load stored face data on mount ──────────────────────────────────────────
  useEffect(() => {
    if (isWeb) {
      setFaceDataLoading(false);
      return;
    }
    if (!user?.id) return;

    setFaceDataLoading(true);
    getFaceData(user.id).then((data) => {
      setFaceDataLoading(false);

      // No face registered locally — block check-in
      if (!data) {
        Alert.alert(
          'Face Not Registered',
          'Register your face in Settings → Register Face before checking in.',
          [
            { text: 'Register Now', onPress: () => navigation.replace('FaceRegistration') },
            { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
          ]
        );
        return;
      }

      // Outdated local format — prompt re-registration
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
        Alert.alert(
          'Invalid Face Data',
          'Your face data is invalid. Please re-register.',
          [
            { text: 'Re-register', onPress: () => navigation.replace('FaceRegistration') },
            { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
          ]
        );
        return;
      }

      setStoredFaceData(data);
    }).catch(() => setFaceDataLoading(false));
  }, [user, navigation, isWeb]);

  // ── Face detection via ML Kit polling ───────────────────────────────────────
  // CameraView has no face-detection callback on SDK 52, so we poll: take a
  // low-quality photo every 1.5 s and run ML Kit detection on it.
  useEffect(() => {
    if (isWeb || !isCameraReady || faceDataLoading) return;
    const id = setInterval(async () => {
      if (pollActiveRef.current || isProcessing || !cameraRef.current) return;
      pollActiveRef.current = true;
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.15, skipProcessing: true, exif: false,
        });
        const faces = await detectFacesFromImage(photo.uri);
        handleFacesDetected({ faces });
      } catch (e) {
        if (e?.message === 'FACE_MODULE_MISSING' || /doesn't seem to be linked/.test(e?.message || '')) {
          setFaceMessage('Face detection unavailable — please update the app');
        }
        /* otherwise camera busy — skip this tick */
      }
      finally { pollActiveRef.current = false; }
    }, 1500);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraReady, isWeb, faceDataLoading]);

  // ── "No face detected" hint after 7s ────────────────────────────────────────
  useEffect(() => {
    if (isWeb || faceDetected || isProcessing) return;
    const interval = setInterval(() => {
      if (Date.now() - lastDetectionTimeRef.current > 7000) {
        setFaceMessage('No face detected — try better lighting or move closer');
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [faceDetected, isProcessing, isWeb]);

  // ── Real-time face detection + local similarity pre-screen ──────────────────
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

    const hasLandmarks =
      face.leftEyeOpenProbability !== undefined ||
      face.rightEyeOpenProbability !== undefined;
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

    // Local pre-screen against AsyncStorage face data
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
            setFaceMessage(`✓ Pre-screen passed — tap to ${mode === 'checkin' ? 'check in' : 'check out'}`);
          } else {
            setFaceMessage(`Hold still... (${count}/${CONSECUTIVE_MATCHES})`);
          }
        } else {
          consecutiveRef.current = 0;
          setConsecutiveMatches(0);
          setFaceMatchConfirmed(false);
          setFaceMessage(
            sim > 0.5
              ? `Partial match (${Math.round(sim * 100)}%) — adjust position`
              : 'Face not recognized — ensure good lighting'
          );
        }
      } else {
        setFaceMessage('Could not extract face features — try better lighting');
        consecutiveRef.current = 0;
        setFaceMatchConfirmed(false);
      }
    } else {
      setFaceMessage('✓ Face detected — loading face data…');
    }
  };

  // ── Check-in / Check-out API calls (require a face token) ───────────────────
  const performCheckIn = async (faceToken) => {
    try {
      await checkIn(routeLocation, faceToken);
      const wifiInfo = await getWifiInfo();

      // For GPS-based check-ins, pass the geofence centre so the auto-checkout
      // monitor knows when the user has left the area.
      const isGps = routeLocation?.locationCenterLat != null;
      const locationMeta = isGps ? {
        latitude:     routeLocation.locationCenterLat,
        longitude:    routeLocation.locationCenterLon,
        radiusMeters: routeLocation.locationRadius,
      } : null;

      await storeCheckIn(wifiInfo?.ssid || null, 0, locationMeta);
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

  const performCheckOut = async (faceToken) => {
    try {
      await checkOut(faceToken);
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

  // ── Main verify + proceed handler ───────────────────────────────────────────
  const verifyAndProceed = async () => {
    setIsProcessing(true);
    setSlowRequest(false);
    slowTimerRef.current = setTimeout(() => setSlowRequest(true), 6000);

    // ── WEB: server-side password verification ─────────────────────────────
    if (isWeb) {
      if (!webPassword || webPassword.length < 6) {
        clearTimeout(slowTimerRef.current);
        showToast('Enter your account password (min 6 characters).', 'error');
        setIsProcessing(false);
        return;
      }

      try {
        const { data } = await verifyWebWithServer(webPassword, mode);
        const faceToken = data?.token;
        if (!faceToken) throw new Error('Server did not return a verification token.');
        if (mode === 'checkin') await performCheckIn(faceToken);
        else await performCheckOut(faceToken);
      } catch (error) {
        clearTimeout(slowTimerRef.current);
        setSlowRequest(false);
        showToast(getApiErrorMessage(error) || 'Incorrect password. Try again.', 'error');
        setIsProcessing(false);
      }
      return;
    }

    // ── NATIVE: face must be detected and locally pre-screened ─────────────
    if (!faceDetected || !faceMatchConfirmed) {
      clearTimeout(slowTimerRef.current);
      showToast(
        !faceDetected
          ? 'Position your face in the frame first'
          : `Hold still — need ${CONSECUTIVE_MATCHES} consistent matches`,
        'error'
      );
      setIsProcessing(false);
      return;
    }

    if (!storedFaceData) {
      clearTimeout(slowTimerRef.current);
      showToast('Face data not loaded. Please try again.', 'error');
      setIsProcessing(false);
      return;
    }

    // Extract current features for server verification
    const currentFeature = currentFaceRef.current
      ? extractFaceFeatures(currentFaceRef.current)
      : null;

    if (!currentFeature || currentFeature.__v !== 2) {
      clearTimeout(slowTimerRef.current);
      showToast('Could not extract face features. Look directly at the camera.', 'error');
      setIsProcessing(false);
      return;
    }

    // Send to server for final authoritative comparison
    try {
      const { data } = await verifyFaceWithServer(currentFeature, mode);
      const faceToken = data?.token;
      if (!faceToken) throw new Error('Server did not return a verification token.');
      if (mode === 'checkin') await performCheckIn(faceToken);
      else await performCheckOut(faceToken);
    } catch (error) {
      clearTimeout(slowTimerRef.current);
      setSlowRequest(false);
      showToast(getApiErrorMessage(error), 'error');
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

  // ── Camera permission gates (native only) ────────────────────────────────────
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
      const canAsk = permission.canAskAgain !== false;
      return (
        <LinearGradient colors={grad.screen} style={s.container}>
          <View style={s.centered}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
            <Text style={[s.title, { color: g.text, textAlign: 'center' }]}>Camera Access Needed</Text>
            <Text style={[s.hint, { color: g.textMuted, textAlign: 'center', marginBottom: 28 }]}>
              {canAsk
                ? 'Camera permission is required to verify your face.'
                : 'Camera permission was denied. Please enable it in Settings.'}
            </Text>
            {canAsk ? (
              <TouchableOpacity style={[s.btn, { backgroundColor: g.accent }]} onPress={requestPermission}>
                <Text style={s.btnText}>Grant Permission</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[s.btn, { backgroundColor: g.accent }]} onPress={() => Linking.openSettings()}>
                <Text style={s.btnText}>Open Settings</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.cancelBtn, { borderColor: g.border }]} onPress={() => navigation.goBack()}>
              <Text style={[s.cancelText, { color: g.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      );
    }
  }

  // Button is ready when:
  //   Web:    password length ≥ 6 (server will verify it — no local bypass)
  //   Native: local pre-screen confirmed (consecutive matches) + face still detected
  const btnReady = isWeb
    ? webPassword.length >= 6
    : faceMatchConfirmed && faceDetected;

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
              ? 'Enter your account password — verified server-side before submitting'
              : `Hold your face in frame — ${CONSECUTIVE_MATCHES} matches required, then server verification`}
          </Text>
        </View>

        {/* ── Web password second factor ── */}
        {isWeb && (
          <View style={[s.webPwBox, { backgroundColor: g.glass, borderColor: g.border }]}>
            <Text style={{ color: g.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 }}>
              CONFIRM IDENTITY — ACCOUNT PASSWORD
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={{
                  flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', borderColor: g.border,
                  color: g.text, borderWidth: 1, borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
                }}
                placeholder="Your account password"
                placeholderTextColor={g.textDim}
                secureTextEntry={!webPasswordShow}
                value={webPassword}
                onChangeText={setWebPassword}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={btnReady ? verifyAndProceed : undefined}
              />
              <TouchableOpacity
                onPress={() => setWebPasswordShow((v) => !v)}
                style={{
                  paddingHorizontal: 14, borderWidth: 1, borderColor: g.border,
                  borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 16 }}>{webPasswordShow ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: g.textDim, fontSize: 11, marginTop: 8, lineHeight: 16 }}>
              Password is verified by the server — it is never stored in the app.
            </Text>
          </View>
        )}

        {/* ── Camera view (native only) ── */}
        <View style={[s.camWrap, {
          width: CAMERA_SIZE,
          height: isWeb ? CAMERA_SIZE * 0.35 : CAMERA_SIZE,
          borderColor: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : g.coral,
        }]}>
          {!isWeb && (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="front"
              onCameraReady={() => setIsCameraReady(true)}
            />
          )}
          {isWeb && (
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 48 }}>🌐</Text>
              <Text style={{ color: g.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                Web — password verification
              </Text>
            </View>
          )}

          {!isWeb && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={[s.corner, s.tl, { borderColor: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : g.coral }]} />
              <View style={[s.corner, s.tr, { borderColor: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : g.coral }]} />
              <View style={[s.corner, s.bl, { borderColor: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : g.coral }]} />
              <View style={[s.corner, s.br, { borderColor: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : g.coral }]} />
              <View style={[s.oval, { borderColor: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : 'rgba(255,255,255,0.3)' }]} />
              {faceBounds && (
                <View style={[s.bbox, {
                  left: faceBounds.origin.x, top: faceBounds.origin.y,
                  width: faceBounds.size.width, height: faceBounds.size.height,
                  borderColor: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : g.coral,
                }]} />
              )}
              <View style={[s.lightPill, {
                backgroundColor: lightingQuality === 'good' ? 'rgba(29,185,138,0.85)' : 'rgba(0,0,0,0.55)',
              }]}>
                <Text style={s.lightText}>
                  {lightingQuality === 'good' ? '☀ Good' : lightingQuality === 'poor' ? '☁ Low light' : '● Checking'}
                </Text>
              </View>
              {consecutiveMatches > 0 && !faceMatchConfirmed && (
                <View style={[s.matchPill, { backgroundColor: 'rgba(139,124,255,0.85)' }]}>
                  <Text style={s.matchText}>{consecutiveMatches}/{CONSECUTIVE_MATCHES}</Text>
                </View>
              )}
              {faceMatchConfirmed && (
                <View style={[s.matchPill, { backgroundColor: 'rgba(62,232,199,0.9)' }]}>
                  <Text style={[s.matchText, { color: '#000' }]}>✓ Pre-screen</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Status pill ── */}
        {!isWeb && (
          <View style={[s.status, {
            backgroundColor: faceMatchConfirmed ? g.mintSoft : faceDetected ? g.accentSoft : g.coralSoft,
          }]}>
            <Text style={[s.statusText, {
              color: faceMatchConfirmed ? g.mint : faceDetected ? g.accent : g.coral,
            }]}>{faceMessage}</Text>
            {similarity > 0 && (
              <Text style={[s.simText, { color: g.textMuted }]}>
                Local match: {matchPct}% {matchPct >= 82 ? '✓' : matchPct >= 60 ? '~' : '✗'} (server verifies on submit)
              </Text>
            )}
          </View>
        )}

        {/* ── Slow request notice ── */}
        {slowRequest && (
          <View style={[s.slowBanner, { backgroundColor: g.accentSoft, borderColor: g.accent }]}>
            <ActivityIndicator size="small" color={g.accent} style={{ marginRight: 8 }} />
            <Text style={[s.slowText, { color: g.accent }]}>
              Server waking up… may take up to 30s on first request
            </Text>
          </View>
        )}

        {/* ── Verify button ── */}
        <TouchableOpacity
          style={[s.btn, {
            backgroundColor: btnReady
              ? (mode === 'checkin' ? g.mint : g.coral)
              : g.textDim,
            opacity: btnReady ? 1 : 0.45,
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
  simText: { fontSize: 11, marginTop: 4, textAlign: 'center' },
  slowBanner: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1,
  },
  slowText: { fontSize: 12, fontWeight: '600', flex: 1 },
  btn: { borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 10 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  cancelText: { fontSize: 14, fontWeight: '600' },
  webPwBox: { borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1 },
});
