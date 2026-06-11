// screens/QrScanScreen.js — QR code scanner for location-based check-in/out

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform, Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import useThemeStore from '../store/themeStore';
import useTimeStore from '../store/timeStore';
import { qrCheckIn, getApiErrorMessage } from '../services/api';

export default function QrScanScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const { checkIn: storeCheckIn, checkOut: storeCheckOut, isCheckedIn } = useTimeStore();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null); // { success, message, action }

  // On web, camera is not available — show instructions
  const isWeb = Platform.OS === 'web';

  const handleBarcode = useCallback(async ({ data }) => {
    if (!scanning || processing) return;
    setScanning(false);
    setProcessing(true);

    try {
      // Vibrate on scan
      if (Platform.OS !== 'web') Vibration.vibrate(50);

      const res = await qrCheckIn(data);
      const { action, message } = res.data;

      // Sync local store
      if (action === 'checkin') {
        storeCheckIn(new Date().toISOString());
      } else {
        storeCheckOut(new Date().toISOString());
      }

      setResult({ success: true, action, message });
    } catch (e) {
      setResult({ success: false, message: getApiErrorMessage(e) });
    } finally {
      setProcessing(false);
    }
  }, [scanning, processing]);

  const handleDone = () => navigation.goBack();
  const handleRetry = () => { setResult(null); setScanning(true); };

  // Result screen
  if (result) {
    const isSuccess = result.success;
    const icon = isSuccess ? (result.action === 'checkin' ? '✅' : '👋') : '❌';
    const color = isSuccess ? g.mint : g.coral;

    return (
      <LinearGradient colors={grad.screen} style={st.fill}>
        <View style={st.resultContainer}>
          <View style={[st.resultCircle, { backgroundColor: `${color}22`, borderColor: color }]}>
            <Text style={{ fontSize: 56 }}>{icon}</Text>
          </View>
          <Text style={[st.resultTitle, { color }]}>
            {isSuccess ? (result.action === 'checkin' ? 'Checked In!' : 'Checked Out!') : 'Scan Failed'}
          </Text>
          <Text style={[st.resultMsg, { color: g.textMuted }]}>{result.message}</Text>

          <View style={st.resultBtns}>
            {!isSuccess && (
              <TouchableOpacity style={[st.retryBtn, { borderColor: g.accent }]} onPress={handleRetry}>
                <Text style={{ color: g.accent, fontWeight: '700', fontSize: 15 }}>Try Again</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleDone}
              activeOpacity={0.85}
            >
              <LinearGradient colors={isSuccess ? ['#3ee8c7', '#00b894'] : grad.button} style={st.doneBtn}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                  {isSuccess ? 'Done' : 'Go Back'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    );
  }

  // Web — camera not supported
  if (isWeb) {
    return (
      <LinearGradient colors={grad.screen} style={st.fill}>
        <View style={st.resultContainer}>
          <Text style={{ fontSize: 52, marginBottom: 16 }}>📱</Text>
          <Text style={[st.resultTitle, { color: g.text }]}>Mobile Only</Text>
          <Text style={[st.resultMsg, { color: g.textMuted }]}>
            QR code scanning requires the mobile app. Use the AttendTrack app on your phone to scan attendance QR codes.
          </Text>
          <TouchableOpacity onPress={handleDone}>
            <LinearGradient colors={grad.button} style={st.doneBtn}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Go Back</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  // Permission not yet requested
  if (!permission) {
    return (
      <LinearGradient colors={grad.screen} style={st.fill}>
        <View style={st.resultContainer}>
          <ActivityIndicator size="large" color={g.accent} />
        </View>
      </LinearGradient>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <LinearGradient colors={grad.screen} style={st.fill}>
        <View style={st.resultContainer}>
          <Text style={{ fontSize: 52, marginBottom: 16 }}>📷</Text>
          <Text style={[st.resultTitle, { color: g.text }]}>Camera Access Needed</Text>
          <Text style={[st.resultMsg, { color: g.textMuted }]}>
            Please grant camera permission to scan QR codes.
          </Text>
          <TouchableOpacity onPress={requestPermission}>
            <LinearGradient colors={grad.button} style={st.doneBtn}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Grant Permission</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDone} style={{ marginTop: 14 }}>
            <Text style={{ color: g.textMuted, fontSize: 14 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={st.fill}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanning ? handleBarcode : undefined}
      />

      {/* Overlay */}
      <View style={st.overlay}>
        <View style={st.topBar}>
          <TouchableOpacity onPress={handleDone} style={st.closeBtn}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>✕ Cancel</Text>
          </TouchableOpacity>
          <Text style={st.topTitle}>Scan QR Code</Text>
          <View style={{ width: 80 }} />
        </View>

        <View style={st.scanFrame}>
          <View style={[st.corner, st.topLeft]} />
          <View style={[st.corner, st.topRight]} />
          <View style={[st.corner, st.bottomLeft]} />
          <View style={[st.corner, st.bottomRight]} />
          {processing && (
            <View style={st.processingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
        </View>

        <View style={st.bottomHint}>
          <Text style={st.hintText}>
            {processing ? 'Processing...' : 'Point your camera at the location QR code'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const CORNER = 28;
const FRAME_SIZE = 240;

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },

  resultContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  resultCircle: {
    width: 120, height: 120, borderRadius: 60,
    borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 24,
  },
  resultTitle:  { fontSize: 26, fontWeight: '900', marginBottom: 10 },
  resultMsg:    { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  resultBtns:   { gap: 12, alignItems: 'center', width: '100%' },
  retryBtn:     { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 32, paddingVertical: 14, width: '100%', alignItems: 'center' },
  doneBtn:      { borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, width: 200, alignItems: 'center' },

  overlay:  { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  closeBtn: { width: 80 },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },

  scanFrame: {
    width: FRAME_SIZE, height: FRAME_SIZE, alignSelf: 'center',
    position: 'relative',
  },
  corner:       { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#3ee8c7', borderWidth: 3 },
  topLeft:      { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  topRight:     { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bottomLeft:   { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  bottomRight:  { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8,
  },

  bottomHint: {
    paddingBottom: 60, paddingHorizontal: 32, alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  hintText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, textAlign: 'center', fontWeight: '600' },
});
