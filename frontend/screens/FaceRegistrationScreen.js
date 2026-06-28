// screens/FaceRegistrationScreen.js
// ArcFace enrollment: capture 2 guided shots (front + slight turn), extract an
// on-device embedding from each, and submit them for MANAGER APPROVAL. Raw
// images never leave the device — only the embeddings are uploaded.

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  Dimensions, Platform, ScrollView, Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import useAuthStore from '../store/authStore';
import Toast from '../components/Toast';
import {
  detectFacesFromImage, processDetectedFace, validateFacePosition,
} from '../services/faceRecognitionService';
import {
  loadModels, analyzeCapture, buildFacePayload, isEmbeddingAvailable,
} from '../services/faceEmbeddingService';
import { registerFaceOnServer, getFaceStatusFromServer, getApiErrorMessage } from '../services/api';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const CAMERA_SIZE = Math.min(screenWidth - 48, screenHeight * 0.42, 380);
const isWeb = Platform.OS === 'web';

// Step-specific pose gates (degrees of yaw).
const FRONT_MAX_YAW = 12;     // front shot must be near-frontal
const TURN_MIN_YAW  = 15;     // turn shot must show a slight angle…
const TURN_MAX_YAW  = 34;     // …but not so much the face is unusable

export default function FaceRegistrationScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const { user } = useAuthStore();
  const [permission, requestPermission] = useCameraPermissions();

  // stage: 'front' → 'turn' → 'uploading' → 'done'
  const [stage, setStage] = useState('front');
  const [busy, setBusy] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [lighting, setLighting] = useState('unknown');
  const [message, setMessage] = useState('Look straight at the camera for shot 1 of 2');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const cameraRef = useRef(null);
  const pollActiveRef = useRef(false);
  const embeddingsRef = useRef([]);
  const lastQualityRef = useRef(null);
  const stageRef = useRef('front');
  useEffect(() => { stageRef.current = stage; }, [stage]);

  const showToast = (m, type = 'error') => setToast({ visible: true, message: m, type });

  // Warm the TFLite models + warn if the user already has an active/pending face.
  useEffect(() => {
    if (isWeb) return;
    loadModels().catch(() => showToast('Face models failed to load — please update the app.'));
    getFaceStatusFromServer()
      .then((r) => {
        const st = r.data?.status;
        if (st === 'approved') {
          Alert.alert('Face Already Registered', 'Re-registering replaces your active face and needs manager approval again.',
            [{ text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() }, { text: 'Re-register' }]);
        } else if (st === 'pending') {
          Alert.alert('Already Pending', 'You already have a face enrollment awaiting approval. Re-submitting will replace it.',
            [{ text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() }, { text: 'Re-submit' }]);
        }
      })
      .catch(() => {});
  }, [navigation]);

  // Live preview poll (guidance only — capture is button-driven per step).
  useEffect(() => {
    if (isWeb || !isCameraReady) return;
    const id = setInterval(async () => {
      if (pollActiveRef.current || busy || !cameraRef.current || ['uploading', 'done'].includes(stageRef.current)) return;
      pollActiveRef.current = true;
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.15, skipProcessing: true, exif: false });
        const faces = await detectFacesFromImage(photo.uri);
        if (!faces?.length) { setFaceDetected(false); setLighting('unknown'); setMessage('No face detected'); return; }
        if (faces.length > 1) { setFaceDetected(false); setMessage('Multiple faces — one person only'); return; }
        const face = processDetectedFace(faces[0]);
        setLighting(face.leftEyeOpenProbability !== undefined ? 'good' : 'poor');
        const v = validateFacePosition(face);
        const yaw = Math.abs(face.yawAngle ?? 0);
        if (!v.valid) { setFaceDetected(false); setMessage(v.message); return; }
        if (stageRef.current === 'front' && yaw > FRONT_MAX_YAW) { setFaceDetected(false); setMessage('Look straight ahead'); return; }
        if (stageRef.current === 'turn' && yaw < TURN_MIN_YAW) { setFaceDetected(false); setMessage('Turn your head slightly to one side'); return; }
        setFaceDetected(true);
        setMessage(stageRef.current === 'front' ? '✓ Hold still — tap Capture (1 of 2)' : '✓ Hold the slight turn — tap Capture (2 of 2)');
      } catch { /* camera busy — skip tick */ }
      finally { pollActiveRef.current = false; }
    }, 1200);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraReady, busy]);

  const captureShot = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: false, exif: false });
      const faces = await detectFacesFromImage(photo.uri);
      if (!faces?.length)      { showToast('No face detected — center your face.'); return; }
      if (faces.length > 1)    { showToast('Multiple faces — one person only.'); return; }

      const face = processDetectedFace(faces[0]);
      const v = validateFacePosition(face);
      if (!v.valid) { showToast(v.message); return; }

      const yaw = Math.abs(face.yawAngle ?? 0);
      if (stage === 'front' && yaw > FRONT_MAX_YAW)              { showToast('Face straight ahead for the front shot.'); return; }
      if (stage === 'turn'  && (yaw < TURN_MIN_YAW || yaw > TURN_MAX_YAW)) { showToast('Turn your head slightly (not too far).'); return; }

      const result = await analyzeCapture({ uri: photo.uri, width: photo.width, height: photo.height }, face);
      if (!result.ok) { showToast(result.reason || 'Capture failed — try again.'); return; }

      embeddingsRef.current.push(result.embedding);
      lastQualityRef.current = result.quality;

      if (stage === 'front') {
        setStage('turn');
        setMessage('Now turn your head slightly to the side for shot 2 of 2');
        showToast('Front shot captured!', 'success');
      } else {
        await upload();
      }
    } catch (e) {
      showToast(e?.message === 'FACE_MODULE_MISSING' ? 'Face models unavailable — update the app.' : 'Capture error — try again.');
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    setStage('uploading');
    try {
      const payload = buildFacePayload(embeddingsRef.current, lastQualityRef.current);
      await registerFaceOnServer(payload);
      setStage('done');
    } catch (e) {
      showToast(getApiErrorMessage(e));
      setStage('turn'); // keep the front embedding; let them retry the upload
    }
  };

  const restart = () => {
    embeddingsRef.current = [];
    lastQualityRef.current = null;
    setStage('front');
    setFaceDetected(false);
    setMessage('Look straight at the camera for shot 1 of 2');
  };

  // ── Web: not supported (browsers can't run the native ML stack) ──────────────
  if (isWeb) {
    return (
      <LinearGradient colors={grad.screen} style={styles.container}>
        <View style={styles.centered}>
          <Text style={{ fontSize: 52, marginBottom: 16 }}>🌐</Text>
          <Text style={[styles.title, { color: g.text, textAlign: 'center' }]}>Not Available on Web</Text>
          <Text style={[styles.hint, { color: g.textMuted, textAlign: 'center', marginBottom: 20 }]}>
            Face registration requires the mobile app.{'\n\n'}
            On web you confirm check-ins with your account password instead.
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: g.accent }]} onPress={() => navigation.goBack()}>
            <Text style={styles.btnText}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  // ── Permission gates ─────────────────────────────────────────────────────────
  if (!permission) {
    return (
      <LinearGradient colors={grad.screen} style={styles.container}>
        <View style={styles.centered}><ActivityIndicator size="large" color={g.accent} />
          <Text style={[styles.hint, { color: g.textMuted, marginTop: 12 }]}>Loading camera…</Text></View>
      </LinearGradient>
    );
  }
  if (!permission.granted) {
    const canAsk = permission.canAskAgain !== false;
    return (
      <LinearGradient colors={grad.screen} style={styles.container}>
        <View style={styles.centered}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
          <Text style={[styles.title, { color: g.text, textAlign: 'center' }]}>Camera Access Needed</Text>
          <Text style={[styles.hint, { color: g.textMuted, textAlign: 'center', marginBottom: 28 }]}>
            {canAsk ? 'Camera permission is required to register your face.'
                    : 'Camera permission was denied. Enable it in your device Settings to continue.'}
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: g.accent }]}
            onPress={canAsk ? requestPermission : () => Linking.openSettings()}>
            <Text style={styles.btnText}>{canAsk ? 'Grant Permission' : 'Open Settings'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cancelBtn, { borderColor: g.border }]} onPress={() => navigation.goBack()}>
            <Text style={[styles.cancelText, { color: g.textMuted }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (stage === 'done') {
    return (
      <LinearGradient colors={grad.screen} style={styles.container}>
        <View style={styles.centered}>
          <Text style={{ fontSize: 56, marginBottom: 12 }}>⏳</Text>
          <Text style={[styles.title, { color: g.text, textAlign: 'center' }]}>Submitted for Approval</Text>
          <Text style={[styles.hint, { color: g.textMuted, textAlign: 'center', marginBottom: 24 }]}>
            Your face has been submitted. A manager must approve it before you can check in with face verification.
            You'll get a notification once it's approved.
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: g.mint }]} onPress={() => navigation.goBack()}>
            <Text style={styles.btnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  const stepNum = stage === 'front' ? 1 : 2;
  const borderColor = stage === 'uploading' ? g.accent : faceDetected ? g.mint : g.coral;

  return (
    <LinearGradient colors={grad.screen} style={styles.container}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible}
        onHide={() => setToast((t) => ({ ...t, visible: false }))} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: g.text }]}>Register Your Face</Text>
          <Text style={[styles.hint, { color: g.textMuted }]}>
            Two quick shots in good lighting. A manager approves your face before it's used.
          </Text>
        </View>

        {/* Step indicator */}
        <View style={styles.stepRow}>
          <View style={[styles.stepDot, { backgroundColor: g.accent }]} />
          <View style={[styles.stepLine, { backgroundColor: stepNum === 2 ? g.accent : g.border }]} />
          <View style={[styles.stepDot, { backgroundColor: stepNum === 2 ? g.accent : g.border }]} />
        </View>

        <View style={[styles.camWrap, { width: CAMERA_SIZE, height: CAMERA_SIZE, borderColor }]}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front"
            onCameraReady={() => setIsCameraReady(true)} />
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {['tl', 'tr', 'bl', 'br'].map((c) => <View key={c} style={[styles.corner, styles[c], { borderColor }]} />)}
            <View style={[styles.oval, { borderColor: faceDetected ? g.mint : 'rgba(255,255,255,0.3)' }]} />
            <View style={[styles.lightPill, { backgroundColor: lighting === 'good' ? 'rgba(29,185,138,0.85)' : 'rgba(0,0,0,0.55)' }]}>
              <Text style={styles.lightText}>{lighting === 'good' ? '☀ Good light' : lighting === 'poor' ? '☁ Low light' : '● Checking'}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.status, { backgroundColor: faceDetected ? g.mintSoft : g.coralSoft }]}>
          <Text style={[styles.statusText, { color: faceDetected ? g.mint : g.coral }]}>
            {stage === 'uploading' ? 'Submitting for approval…' : message}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: faceDetected && !busy ? g.mint : g.textDim, opacity: faceDetected && !busy ? 1 : 0.5 }]}
          onPress={captureShot}
          disabled={!faceDetected || busy || stage === 'uploading'}
        >
          {busy || stage === 'uploading'
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>📷  Capture shot {stepNum} of 2</Text>}
        </TouchableOpacity>

        {embeddingsRef.current.length > 0 && stage !== 'uploading' && (
          <TouchableOpacity style={[styles.cancelBtn, { borderColor: g.border }]} onPress={restart} disabled={busy}>
            <Text style={[styles.cancelText, { color: g.textMuted }]}>↺  Start over</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.cancelBtn, { borderColor: g.border, marginTop: 8 }]} onPress={() => navigation.goBack()} disabled={busy}>
          <Text style={[styles.cancelText, { color: g.textMuted }]}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const CORNER = 22;
const CW = 3;
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
  camWrap: { alignSelf: 'center', borderRadius: 20, borderWidth: 2, overflow: 'hidden', marginBottom: 14 },
  oval: { position: 'absolute', alignSelf: 'center', top: '10%', width: '55%', height: '75%', borderRadius: 200, borderWidth: 2, borderStyle: 'dashed' },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  tl: { top: 14, left: 14, borderTopWidth: CW, borderLeftWidth: CW, borderTopLeftRadius: 6 },
  tr: { top: 14, right: 14, borderTopWidth: CW, borderRightWidth: CW, borderTopRightRadius: 6 },
  bl: { bottom: 14, left: 14, borderBottomWidth: CW, borderLeftWidth: CW, borderBottomLeftRadius: 6 },
  br: { bottom: 14, right: 14, borderBottomWidth: CW, borderRightWidth: CW, borderBottomRightRadius: 6 },
  lightPill: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  lightText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  status: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 14, alignItems: 'center' },
  statusText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  btn: { borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 10 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, marginBottom: 8 },
  cancelText: { fontSize: 14, fontWeight: '600' },
});
