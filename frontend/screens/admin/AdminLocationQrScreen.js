// screens/admin/AdminLocationQrScreen.js — Display QR code for a location

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Image, ScrollView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../../store/themeStore';
import { adminGetLocationQr, getApiErrorMessage } from '../../services/api';
import ScreenHeader from '../../components/ScreenHeader';
import { useToast } from '../../components/ToastProvider';

const QR_API = 'https://api.qrserver.com/v1/create-qr-code';
const QR_SIZE = 280;

function buildQrImageUrl(token) {
  const encoded = encodeURIComponent(token);
  return `${QR_API}/?size=${QR_SIZE}x${QR_SIZE}&data=${encoded}&margin=10&color=1a1a2e`;
}

function countdown(expiresAt) {
  const remaining = Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return remaining <= 0 ? 'Expired' : `${m}:${String(s).padStart(2, '0')}`;
}

export default function AdminLocationQrScreen({ navigation, route }) {
  const { location } = route.params;
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]    = useState(null);
  const [timer, setTimer]    = useState(null);

  const fetchQr = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminGetLocationQr(location.id);
      setQrData(res.data);
      // Countdown timer
      if (timer) clearInterval(timer);
      const t = setInterval(() => {
        setQrData((prev) => prev ? { ...prev, _tick: Date.now() } : null);
      }, 1000);
      setTimer(t);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [location.id]);

  // Auto-fetch on mount
  React.useEffect(() => {
    fetchQr();
    return () => { if (timer) clearInterval(timer); };
  }, []);

  const isExpired = qrData && new Date(qrData.expiresAt) <= new Date();
  const qrImageUrl = qrData && !isExpired ? buildQrImageUrl(qrData.token) : null;
  const timeLeft = qrData ? countdown(qrData.expiresAt) : null;

  return (
    <LinearGradient colors={grad.screen} style={st.fill}>
      <ScreenHeader title="Location QR Code" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={st.inner} showsVerticalScrollIndicator={false}>

        {/* Location info */}
        <LinearGradient colors={grad.card} style={[st.locationCard, { borderColor: g.border }]}>
          <Text style={{ fontSize: 28, marginBottom: 8 }}>📍</Text>
          <Text style={[st.locationName, { color: g.text }]}>{location.name}</Text>
          {location.address ? (
            <Text style={[st.locationAddr, { color: g.textMuted }]}>{location.address}</Text>
          ) : null}
        </LinearGradient>

        {/* QR code display */}
        <LinearGradient colors={grad.card} style={[st.qrCard, { borderColor: g.border }]}>
          {loading ? (
            <View style={st.qrPlaceholder}>
              <ActivityIndicator size="large" color={g.accent} />
              <Text style={[st.hint, { color: g.textMuted }]}>Generating QR code…</Text>
            </View>
          ) : error ? (
            <View style={st.qrPlaceholder}>
              <Text style={{ fontSize: 36, marginBottom: 10 }}>⚠️</Text>
              <Text style={[st.hint, { color: g.coral }]}>{error}</Text>
            </View>
          ) : isExpired ? (
            <View style={st.qrPlaceholder}>
              <Text style={{ fontSize: 36, marginBottom: 10 }}>⏱️</Text>
              <Text style={[st.hint, { color: g.coral }]}>QR code has expired.</Text>
              <Text style={[st.hint, { color: g.textMuted }]}>Tap Refresh to generate a new one.</Text>
            </View>
          ) : qrImageUrl ? (
            <>
              <View style={st.qrFrame}>
                <Image
                  source={{ uri: qrImageUrl }}
                  style={{ width: QR_SIZE, height: QR_SIZE }}
                  resizeMode="contain"
                />
              </View>
              <View style={[st.timerRow, { backgroundColor: timeLeft === 'Expired' ? g.coralSoft : g.accentSoft }]}>
                <Text style={{ fontSize: 14 }}>⏱️</Text>
                <Text style={[st.timerText, { color: timeLeft === 'Expired' ? g.coral : g.accent }]}>
                  Expires in {timeLeft}
                </Text>
              </View>
            </>
          ) : null}

          {/* Refresh button */}
          <TouchableOpacity
            style={[st.refreshBtn, { borderColor: g.accent, opacity: loading ? 0.6 : 1 }]}
            onPress={fetchQr}
            disabled={loading}
          >
            <Text style={{ color: g.accent, fontWeight: '700', fontSize: 14 }}>
              {loading ? 'Generating…' : '🔄 Refresh QR Code'}
            </Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* Instructions */}
        <LinearGradient colors={grad.card} style={[st.infoCard, { borderColor: g.border }]}>
          <Text style={[st.infoTitle, { color: g.text }]}>How to use</Text>
          {[
            { icon: '🖨️', text: 'Print or display this QR code at your office entrance or kiosk.' },
            { icon: '📱', text: 'Employees open the AttendTrack app and tap "Scan QR" on their dashboard.' },
            { icon: '✅', text: 'Scanning checks them in (or out if already checked in).' },
            { icon: '⏱️', text: `QR codes expire every 5 minutes. Refresh for a new one to prevent replay.` },
          ].map((item, i) => (
            <View key={i} style={st.infoRow}>
              <Text style={{ fontSize: 18, width: 28 }}>{item.icon}</Text>
              <Text style={[st.infoText, { color: g.textMuted }]}>{item.text}</Text>
            </View>
          ))}
        </LinearGradient>

        <View style={{ height: 40 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  fill:  { flex: 1 },
  inner: { padding: 16, paddingBottom: 40 },

  locationCard: {
    borderRadius: 18, borderWidth: 1, padding: 20, marginBottom: 16,
    alignItems: 'center',
  },
  locationName: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  locationAddr: { fontSize: 13, marginTop: 4, textAlign: 'center' },

  qrCard: {
    borderRadius: 18, borderWidth: 1, padding: 20, marginBottom: 16,
    alignItems: 'center', gap: 14,
  },
  qrPlaceholder: { height: QR_SIZE, justifyContent: 'center', alignItems: 'center', gap: 10 },
  qrFrame: {
    borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(139,124,255,0.3)',
    backgroundColor: '#fff', padding: 8,
  },
  timerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  timerText: { fontSize: 14, fontWeight: '800' },
  refreshBtn: {
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12, width: '100%', alignItems: 'center',
  },
  hint: { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  infoCard:  { borderRadius: 18, borderWidth: 1, padding: 16 },
  infoTitle: { fontSize: 15, fontWeight: '800', marginBottom: 12 },
  infoRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  infoText:  { fontSize: 13, flex: 1, lineHeight: 20 },
});
