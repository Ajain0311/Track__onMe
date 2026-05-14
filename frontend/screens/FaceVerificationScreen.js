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
  verifyFace,
  hasFaceData,
} from '../services/faceRecognitionService';
import { checkIn, checkOut, getApiErrorMessage } from '../services/api';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const CAMERA_SIZE = Math.min(screenWidth - 48, screenHeight * 0.42, 380);

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
  const [faceBounds, setFaceBounds] = useState(null);
  const [lightingQuality, setLightingQuality] = useState('unknown');
  const [slowRequest, setSlowRequest] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const cameraRef = useRef(null);
  const currentFaceRef = useRef(null);
  const lastDetectionTimeRef = useRef(Date.now());
  const slowTimerRef = useRef(null);

  const showToast = (message, type = 'success') =>
    setToast({ visible: true, message, type });

  useEffect(() => {
    if (!user?.id) return;
    hasFaceData(user.id).then((hasData) => {
      if (!hasData) {
        Alert.alert(
          'Face Not Registered',
          'Register your face in Settings before checking in.',
          [
            { text: 'Register Now', onPress: () => navigation.replace('FaceRegistration') },
            { text: 'Cancel', style: 'cancel', onPress: () => navigation.goBack() },
          ]
        );
      }
    });
  }, [user, navigation]);

  useEffect(() => {
    if (isWeb || faceDetected || isProcessing) return;
    const interval = setInterval(() => {
      if (Date.now() - lastDetectionTimeRef.current > 7000) {
        setFaceMessage('No face detected — try better lighting or move closer');
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [faceDetected, isProcessing]);

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
      return;
    }
    if (faces.length > 1) {
      setFaceDetected(false);
      setFaceMessage('Multiple faces detected — one person only');
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
      setFaceMessage('✓ Face detected — tap Verify');
    } else {
      setFaceDetected(false);
      setFaceMessage(validation.message);
      setSimilarity(0);
    }
  };

  const performCheckIn = async () => {
    try {
      await checkIn(routeLocation);
      await storeCheckIn();
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

  const verifyAndProceed = async () => {
    setIsProcessing(true);
    setSlowRequest(false);
    slowTimerRef.current = setTimeout(() => setSlowRequest(true), 6000);

    if (isWeb) {
      if (mode === 'checkin') await performCheckIn();
      else await performCheckOut();
      return;
    }

    if (!cameraRef.current || !faceDetected || !currentFaceRef.current) {
      clearTimeout(slowTimerRef.current);
      showToast('Position your face correctly first', 'error');
      setIsProcessing(false);
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: true });
      const face = currentFaceRef.current;
      const faceFeatures = extractFaceFeatures(face);

      if (!faceFeatures) {
        clearTimeout(slowTimerRef.current);
        showToast('Could not extract face features. Try again.', 'error');
        setIsProcessing(false);
        return;
      }

      const result = await verifyFace(user.id, faceFeatures, 0.75, photo.uri);
      setSimilarity(result.similarity);

      if (!result.success) {
        clearTimeout(slowTimerRef.current);
        showToast(result.message || 'Face not recognized. Try again.', 'error');
        setIsProcessing(false);
        return;
      }

      if (result.isNewRegistration) {
        clearTimeout(slowTimerRef.current);
        showToast('Face registered! Tap again to check in.', 'success');
        setIsProcessing(false);
        setTimeout(() => navigation.goBack(), 1800);
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

  const btnReady = isWeb || faceDetected;

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
              : `Verify your face to ${mode === 'checkin' ? 'check in' : 'check out'}`}
          </Text>
        </View>

        {/* Camera */}
        <View style={[s.camWrap, {
          width: CAMERA_SIZE,
          height: CAMERA_SIZE,
          borderColor: btnReady ? g.mint : g.coral,
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
            <View style={[s.corner, s.tl, { borderColor: btnReady ? g.mint : g.coral }]} />
            <View style={[s.corner, s.tr, { borderColor: btnReady ? g.mint : g.coral }]} />
            <View style={[s.corner, s.bl, { borderColor: btnReady ? g.mint : g.coral }]} />
            <View style={[s.corner, s.br, { borderColor: btnReady ? g.mint : g.coral }]} />
            {!isWeb && (
              <View style={[s.oval, { borderColor: faceDetected ? g.mint : 'rgba(255,255,255,0.3)' }]} />
            )}
            {faceBounds && (
              <View style={[s.bbox, {
                left: faceBounds.origin.x,
                top: faceBounds.origin.y,
                width: faceBounds.size.width,
                height: faceBounds.size.height,
                borderColor: faceDetected ? g.mint : g.coral,
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
          </View>
        </View>

        {/* Status */}
        <View style={[s.status, { backgroundColor: btnReady ? g.mintSoft : g.coralSoft }]}>
          <Text style={[s.statusText, { color: btnReady ? g.mint : g.coral }]}>{faceMessage}</Text>
          {similarity > 0 && (
            <Text style={[s.simText, { color: g.textMuted }]}>Match: {Math.round(similarity * 100)}%</Text>
          )}
        </View>

        {/* Slow request notice */}
        {slowRequest && (
          <View style={[s.slowBanner, { backgroundColor: g.accentSoft, borderColor: g.accent }]}>
            <ActivityIndicator size="small" color={g.accent} style={{ marginRight: 8 }} />
            <Text style={[s.slowText, { color: g.accent }]}>
              Server waking up... may take up to 30s on first request
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
  bbox: { position: 'absolute', borderWidth: 2, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  tl: { top: 14, left: 14, borderTopWidth: CW, borderLeftWidth: CW, borderTopLeftRadius: 6 },
  tr: { top: 14, right: 14, borderTopWidth: CW, borderRightWidth: CW, borderTopRightRadius: 6 },
  bl: { bottom: 14, left: 14, borderBottomWidth: CW, borderLeftWidth: CW, borderBottomLeftRadius: 6 },
  br: { bottom: 14, right: 14, borderBottomWidth: CW, borderRightWidth: CW, borderBottomRightRadius: 6 },
  lightPill: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  lightText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  status: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12, alignItems: 'center' },
  statusText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  simText: { fontSize: 12, marginTop: 4 },
  slowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  slowText: { fontSize: 12, fontWeight: '600', flex: 1 },
  btn: { borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 10 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  cancelText: { fontSize: 14, fontWeight: '600' },
});
