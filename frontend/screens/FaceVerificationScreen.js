// screens/FaceVerificationScreen.js
//
// SECURITY MODEL:
//   Native (iOS/Android):
//     1. ML Kit detects exactly one well-posed face.
//     2. Active liveness: the user must BLINK (eyes open→closed→open).
//     3. One frame is auto-captured → on-device passive anti-spoof + quality gate
//        → ArcFace embedding (faceEmbeddingService).
//     4. The embedding is sent to POST /api/face/verify, which compares it
//        (cosine) against the user's manager-APPROVED enrollment and, on a match,
//        returns a signed faceToken (2-min TTL).
//     5. Check-in/out then runs automatically — there is NO manual Verify button.
//
//   Web: account-password second factor → POST /api/face/verify-web → faceToken.
//
//   NO BYPASS: the backend rejects check-in/out without a valid faceToken.

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Dimensions, Platform, Linking, TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import useAuthStore from '../store/authStore';
import useTimeStore from '../store/timeStore';
import Toast from '../components/Toast';
import {
  detectFacesFromImage, processDetectedFace, validateFacePosition,
} from '../services/faceRecognitionService';
import {
  loadModels, analyzeCapture, buildFacePayload,
} from '../services/faceEmbeddingService';
import {
  checkIn, checkOut,
  verifyFaceWithServer, verifyWebWithServer, getFaceStatusFromServer,
  getApiErrorMessage,
} from '../services/api';
import { getWifiInfo } from '../services/wifiService';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const CAMERA_SIZE = Math.min(screenWidth - 48, screenHeight * 0.42, 380);

// Blink thresholds on ML Kit eye-open probabilities.
const EYE_OPEN = 0.6;
const EYE_SHUT = 0.3;

export default function FaceVerificationScreen({ navigation, route }) {
  const { mode, location: routeLocation = null } = route.params || { mode: 'checkin' };
  const isWeb = Platform.OS === 'web';
  const { colors: g, gradients: grad } = useThemeStore();
  const { checkIn: storeCheckIn, checkOut: storeCheckOut } = useTimeStore();

  const [permission, requestPermission] = useCameraPermissions();
  const [statusLoading, setStatusLoading] = useState(!isWeb);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [faceMessage, setFaceMessage] = useState(
    isWeb ? 'Confirm your identity with your account password' : 'Position your face in the frame'
  );
  const [matchState, setMatchState] = useState('searching'); // searching | blink | verifying | done
  const [slowRequest, setSlowRequest] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  // Web second factor
  const [webPassword, setWebPassword] = useState('');
  const [webPasswordShow, setWebPasswordShow] = useState(false);

  const cameraRef = useRef(null);
  const pollActiveRef = useRef(false);
  const verifyingRef = useRef(false);
  const blinkPhaseRef = useRef(0); // 0 need-open, 1 saw-open, 2 saw-closed → blink complete
  const slowTimerRef = useRef(null);

  const showToast = (message, type = 'error') => setToast({ visible: true, message, type });

  // ── Warm models + preflight the server face status (native) ──────────────────
  useEffect(() => {
    if (isWeb) return;
    loadModels().catch(() => showToast('Face models failed to load — please update the app.'));
    getFaceStatusFromServer()
      .then((r) => {
        const st = r.data?.status;
        setStatusLoading(false);
        if (st === 'approved') return; // good to verify
        if (st === 'pending') {
          showToast('Your face is awaiting manager approval.', 'error');
          setFaceMessage('Awaiting manager approval — you cannot check in yet.');
          setTimeout(() => navigation.goBack(), 2200);
        } else {
          // none or rejected → send to registration
          navigation.replace('FaceRegistration');
        }
      })
      .catch(() => { setStatusLoading(false); /* let them try; verify will 4xx clearly */ });
  }, [isWeb, navigation]);

  // ── Native liveness/verify poll ──────────────────────────────────────────────
  useEffect(() => {
    if (isWeb || !isCameraReady || statusLoading) return;
    const id = setInterval(async () => {
      if (pollActiveRef.current || verifyingRef.current || isProcessing || !cameraRef.current) return;
      pollActiveRef.current = true;
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.15, skipProcessing: true, exif: false });
        const faces = await detectFacesFromImage(photo.uri);

        if (!faces?.length) { resetChallenge('No face detected'); return; }
        if (faces.length > 1) { resetChallenge('Multiple faces — one person only'); return; }

        const face = processDetectedFace(faces[0]);
        const v = validateFacePosition(face);
        if (!v.valid) { resetChallenge(v.message); return; }

        // Active liveness — require a blink before we capture.
        const lo = face.leftEyeOpenProbability, ro = face.rightEyeOpenProbability;
        const eyesOpen = lo > EYE_OPEN && ro > EYE_OPEN;
        const eyesShut = lo < EYE_SHUT && ro < EYE_SHUT;

        if (blinkPhaseRef.current === 0) {
          setMatchState('blink');
          if (eyesOpen) { blinkPhaseRef.current = 1; }
          setFaceMessage('Blink to verify');
        } else if (blinkPhaseRef.current === 1) {
          if (eyesShut) blinkPhaseRef.current = 2;
          setFaceMessage('Blink to verify');
        } else if (blinkPhaseRef.current === 2) {
          if (eyesOpen) {
            // Blink complete — capture + verify (guarded so it runs once).
            runVerification();
          }
        }
      } catch (e) {
        if (e?.message === 'FACE_MODULE_MISSING') setFaceMessage('Face detection unavailable — update the app');
        /* otherwise camera busy — skip tick */
      } finally {
        pollActiveRef.current = false;
      }
    }, 900);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraReady, isWeb, statusLoading, isProcessing]);

  const resetChallenge = (msg) => {
    if (verifyingRef.current) return;
    blinkPhaseRef.current = 0;
    setMatchState('searching');
    if (msg) setFaceMessage(msg);
  };

  // ── Capture one frame → anti-spoof + embedding → server verify → check-in ────
  const runVerification = async () => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setMatchState('verifying');
    setIsProcessing(true);
    setFaceMessage('Verifying…');
    slowTimerRef.current = setTimeout(() => setSlowRequest(true), 6000);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: false, exif: false });
      const faces = await detectFacesFromImage(photo.uri);
      if (faces?.length !== 1) throw new Error('Make sure only your face is in the frame.');

      const face = processDetectedFace(faces[0]);
      const result = await analyzeCapture({ uri: photo.uri, width: photo.width, height: photo.height }, face);
      if (!result.ok) throw new Error(result.reason || 'Capture failed.');

      const payload = buildFacePayload([result.embedding], result.quality);
      const { data } = await verifyFaceWithServer(payload, mode);
      const faceToken = data?.token;
      if (!faceToken) throw new Error('Server did not return a verification token.');

      setMatchState('done');
      if (mode === 'checkin') await performCheckIn(faceToken);
      else await performCheckOut(faceToken);
    } catch (error) {
      clearTimeout(slowTimerRef.current);
      setSlowRequest(false);
      setIsProcessing(false);
      verifyingRef.current = false;
      blinkPhaseRef.current = 0;
      setMatchState('searching');
      const msg = error?.response ? getApiErrorMessage(error) : (error?.message || 'Verification failed.');
      showToast(msg, 'error');
      setFaceMessage('Try again — blink to verify');
    }
  };

  // ── Check-in / Check-out (unchanged contract: faceToken → /api/checkin) ──────
  const performCheckIn = async (faceToken) => {
    try {
      await checkIn(routeLocation, faceToken);
      const wifiInfo = await getWifiInfo();
      const isGps = routeLocation?.locationCenterLat != null;
      const locationMeta = isGps ? {
        latitude: routeLocation.locationCenterLat,
        longitude: routeLocation.locationCenterLon,
        radiusMeters: routeLocation.locationRadius,
      } : null;
      await storeCheckIn(wifiInfo?.ssid || null, 0, locationMeta);
      clearTimeout(slowTimerRef.current); setSlowRequest(false);
      showToast('Check-in successful!', 'success');
      setTimeout(() => navigation.goBack(), 1500);
    } catch (error) {
      clearTimeout(slowTimerRef.current); setSlowRequest(false);
      showToast(getApiErrorMessage(error), 'error');
      setIsProcessing(false); verifyingRef.current = false; blinkPhaseRef.current = 0; setMatchState('searching');
    }
  };

  const performCheckOut = async (faceToken) => {
    try {
      await checkOut(faceToken);
      await storeCheckOut();
      clearTimeout(slowTimerRef.current); setSlowRequest(false);
      showToast('Check-out successful!', 'success');
      setTimeout(() => navigation.goBack(), 1500);
    } catch (error) {
      clearTimeout(slowTimerRef.current); setSlowRequest(false);
      showToast(getApiErrorMessage(error), 'error');
      setIsProcessing(false); verifyingRef.current = false; blinkPhaseRef.current = 0; setMatchState('searching');
    }
  };

  // ── Web: password second factor ──────────────────────────────────────────────
  const verifyWeb = async () => {
    if (!webPassword || webPassword.length < 6) {
      showToast('Enter your account password (min 6 characters).', 'error');
      return;
    }
    setIsProcessing(true);
    slowTimerRef.current = setTimeout(() => setSlowRequest(true), 6000);
    try {
      const { data } = await verifyWebWithServer(webPassword, mode);
      const faceToken = data?.token;
      if (!faceToken) throw new Error('Server did not return a verification token.');
      if (mode === 'checkin') await performCheckIn(faceToken);
      else await performCheckOut(faceToken);
    } catch (error) {
      clearTimeout(slowTimerRef.current); setSlowRequest(false);
      showToast(getApiErrorMessage(error) || 'Incorrect password. Try again.', 'error');
      setIsProcessing(false);
    }
  };

  // ── Loading face status (native) ─────────────────────────────────────────────
  if (statusLoading && !isWeb) {
    return (
      <LinearGradient colors={grad.screen} style={s.container}>
        <View style={s.centered}><ActivityIndicator size="large" color={g.accent} />
          <Text style={[s.hint, { color: g.textMuted, marginTop: 12 }]}>Checking face status…</Text></View>
      </LinearGradient>
    );
  }

  // ── Camera permission gates (native) ──────────────────────────────────────────
  if (!isWeb) {
    if (!permission) {
      return (
        <LinearGradient colors={grad.screen} style={s.container}>
          <View style={s.centered}><ActivityIndicator size="large" color={g.accent} />
            <Text style={[s.hint, { color: g.textMuted, marginTop: 12 }]}>Loading camera…</Text></View>
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
              {canAsk ? 'Camera permission is required to verify your face.' : 'Camera permission was denied. Please enable it in Settings.'}
            </Text>
            <TouchableOpacity style={[s.btn, { backgroundColor: g.accent }]}
              onPress={canAsk ? requestPermission : () => Linking.openSettings()}>
              <Text style={s.btnText}>{canAsk ? 'Grant Permission' : 'Open Settings'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.cancelBtn, { borderColor: g.border }]} onPress={() => navigation.goBack()}>
              <Text style={[s.cancelText, { color: g.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      );
    }
  }

  const confirmed = matchState === 'done';
  const blinking = matchState === 'blink' || matchState === 'verifying';
  const borderColor = confirmed ? g.mint : blinking ? g.accent : g.coral;

  return (
    <LinearGradient colors={grad.screen} style={s.container}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible}
        onHide={() => setToast((t) => ({ ...t, visible: false }))} />

      <View style={s.inner}>
        <View style={s.header}>
          <Text style={[s.title, { color: g.text }]}>{mode === 'checkin' ? 'Face Check-in' : 'Face Check-out'}</Text>
          <Text style={[s.hint, { color: g.textMuted }]}>
            {isWeb ? 'Enter your account password — verified server-side before submitting'
                   : 'Look at the camera and blink — verification happens automatically'}
          </Text>
        </View>

        {/* Web password second factor */}
        {isWeb && (
          <View style={[s.webPwBox, { backgroundColor: g.glass, borderColor: g.border }]}>
            <Text style={{ color: g.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 }}>
              CONFIRM IDENTITY — ACCOUNT PASSWORD
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', borderColor: g.border, color: g.text, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 }}
                placeholder="Your account password" placeholderTextColor={g.textDim}
                secureTextEntry={!webPasswordShow} value={webPassword} onChangeText={setWebPassword}
                autoCapitalize="none" autoCorrect={false}
                onSubmitEditing={webPassword.length >= 6 ? verifyWeb : undefined}
              />
              <TouchableOpacity onPress={() => setWebPasswordShow((v) => !v)}
                style={{ paddingHorizontal: 14, borderWidth: 1, borderColor: g.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16 }}>{webPasswordShow ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Camera (native) */}
        <View style={[s.camWrap, { width: CAMERA_SIZE, height: isWeb ? CAMERA_SIZE * 0.35 : CAMERA_SIZE, borderColor }]}>
          {!isWeb ? (
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front"
              onCameraReady={() => setIsCameraReady(true)} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 48 }}>🌐</Text>
              <Text style={{ color: g.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center' }}>Web — password verification</Text>
            </View>
          )}
          {!isWeb && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {['tl', 'tr', 'bl', 'br'].map((c) => <View key={c} style={[s.corner, s[c], { borderColor }]} />)}
              <View style={[s.oval, { borderColor: confirmed ? g.mint : blinking ? g.accent : 'rgba(255,255,255,0.3)' }]} />
            </View>
          )}
        </View>

        {/* Status */}
        {!isWeb && (
          <View style={[s.status, { backgroundColor: confirmed ? g.mintSoft : blinking ? g.accentSoft : g.coralSoft }]}>
            <Text style={[s.statusText, { color: confirmed ? g.mint : blinking ? g.accent : g.coral }]}>{faceMessage}</Text>
          </View>
        )}

        {slowRequest && (
          <View style={[s.slowBanner, { backgroundColor: g.accentSoft, borderColor: g.accent }]}>
            <ActivityIndicator size="small" color={g.accent} style={{ marginRight: 8 }} />
            <Text style={[s.slowText, { color: g.accent }]}>Server waking up… may take up to 30s on first request</Text>
          </View>
        )}

        {/* Web verify button (native has no button — it's automatic) */}
        {isWeb && (
          <TouchableOpacity
            style={[s.btn, { backgroundColor: webPassword.length >= 6 ? (mode === 'checkin' ? g.mint : g.coral) : g.textDim, opacity: webPassword.length >= 6 ? 1 : 0.45 }]}
            onPress={verifyWeb} disabled={webPassword.length < 6 || isProcessing}
          >
            {isProcessing ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>{mode === 'checkin' ? '▶  Verify & Check In' : '■  Verify & Check Out'}</Text>}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[s.cancelBtn, { borderColor: g.border }]} onPress={() => navigation.goBack()} disabled={isProcessing}>
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
  camWrap: { alignSelf: 'center', borderRadius: 20, borderWidth: 2.5, overflow: 'hidden', marginBottom: 16 },
  oval: { position: 'absolute', alignSelf: 'center', top: '10%', width: '55%', height: '75%', borderRadius: 200, borderWidth: 2, borderStyle: 'dashed' },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  tl: { top: 14, left: 14, borderTopWidth: CW, borderLeftWidth: CW, borderTopLeftRadius: 6 },
  tr: { top: 14, right: 14, borderTopWidth: CW, borderRightWidth: CW, borderTopRightRadius: 6 },
  bl: { bottom: 14, left: 14, borderBottomWidth: CW, borderLeftWidth: CW, borderBottomLeftRadius: 6 },
  br: { bottom: 14, right: 14, borderBottomWidth: CW, borderRightWidth: CW, borderBottomRightRadius: 6 },
  status: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12, alignItems: 'center' },
  statusText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  slowBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1 },
  slowText: { fontSize: 12, fontWeight: '600', flex: 1 },
  btn: { borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 10 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  cancelText: { fontSize: 14, fontWeight: '600' },
  webPwBox: { borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1 },
});
