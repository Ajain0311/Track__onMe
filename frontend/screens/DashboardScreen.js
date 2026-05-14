// screens/DashboardScreen.js — glossy dashboard + check-in/out with total time tracking

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, RefreshControl, Platform,
  Vibration, Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { checkIn, checkOut, getStatus, getApiErrorMessage } from '../services/api';
import { logOut } from '../services/authService';
import useAuthStore from '../store/authStore';
import useTimeStore from '../store/timeStore';
import useThemeStore from '../store/themeStore';
import { isBiometricAvailable, getBiometricLabel } from '../services/biometricAuth';
import { validateWifiConnection, getAllowedWifiName } from '../services/wifiService';
import { validateAttendanceLocation } from '../services/locationService';
import { hasFaceData } from '../services/faceRecognitionService';

const triggerHaptic = (type = 'light') => {
  if (Platform.OS === 'web') return;
  try {
    const Haptics = require('expo-haptics');
    if (type === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {
    Vibration.vibrate(type === 'success' ? 50 : 30);
  }
};

const formatDuration = (totalSeconds) => {
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const formatDurationCompact = (totalSeconds) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const formatTime = (iso) => {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
};

const staticStyles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flex: 1 },
  inner: { padding: 24, paddingTop: 56, paddingBottom: 100 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  statusText: { fontSize: 18, fontWeight: '800' },
  statusSub: { fontSize: 13, marginTop: 10, lineHeight: 20 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  liveIndicator: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  timerLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  timerValue: { fontSize: 44, fontWeight: '900', marginTop: 8, fontVariant: ['tabular-nums'] },
  timerSub: { fontSize: 13, marginTop: 8 },
  totalTimeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  totalTimeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  totalTimeBadgeText: { fontSize: 11, fontWeight: '700' },
  totalTimeValue: { fontSize: 36, fontWeight: '900', marginBottom: 16, fontVariant: ['tabular-nums'] },
  timeStatsRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 12 },
  timeStat: { flex: 1, alignItems: 'center' },
  timeStatValue: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  timeStatLabel: { fontSize: 12 },
  timeStatDivider: { width: 1, height: 30 },
  buttonRow: { flexDirection: 'row', gap: 12, marginBottom: 22 },
  btnShell: { flex: 1, borderRadius: 18, overflow: 'hidden', elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  btnOff: { opacity: 0.45 },
  btnPressed: { transform: [{ scale: 0.96 }] },
  btnGrad: { paddingVertical: 20, alignItems: 'center', justifyContent: 'center' },
  btnEmoji: { fontSize: 18, color: 'rgba(255,255,255,0.9)', marginBottom: 4 },
  btnLabel: { color: '#fff', fontSize: 15, fontWeight: '800' },
  infoTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  infoDate: { fontSize: 17, fontWeight: '800', marginTop: 6 },
  infoHint: { fontSize: 12, marginTop: 8, lineHeight: 18 },
  errorBannerTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  errorBannerText: { fontSize: 13, lineHeight: 20 },
  retryBtnText: { fontWeight: '800', fontSize: 14 },
});

export default function DashboardScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const { colors: g, gradients: grad, isDark } = useThemeStore();
  const {
    isCheckedIn: storeIsCheckedIn,
    currentSessionSeconds,
    totalTimeSeconds,
    checkIn: storeCheckIn,
    checkOut: storeCheckOut,
    tick,
    getTodayTotal,
    getWeekTotal,
    initialize: initializeTimeStore,
  } = useTimeStore();

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checkInPressed, setCheckInPressed] = useState(false);
  const [checkOutPressed, setCheckOutPressed] = useState(false);
  const [wifiStatus, setWifiStatus] = useState({ valid: false, message: 'Checking...' });
  const [biometricStatus, setBiometricStatus] = useState({ available: false, label: 'Biometric' });
  // connectStatus: combined WiFi + location fallback state
  const [connectStatus, setConnectStatus] = useState({ valid: false, message: 'Checking...', type: 'checking' });
  const [faceRegistered, setFaceRegistered] = useState(false);
  const timerRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const checkRequirements = useCallback(async () => {
    const wifiValidation = await validateWifiConnection();
    setWifiStatus(wifiValidation);

    if (wifiValidation.valid) {
      setConnectStatus({ valid: true, message: wifiValidation.message, type: 'wifi' });
    } else {
      // WiFi failed — try location fallback
      const locResult = await validateAttendanceLocation();
      if (locResult.valid) {
        setConnectStatus({ valid: true, message: locResult.message, type: 'location' });
      } else {
        setConnectStatus({ valid: false, message: wifiValidation.message, type: 'none' });
      }
    }

    const biometricAvailable = await isBiometricAvailable();
    const biometricLabelText = await getBiometricLabel();
    setBiometricStatus({ available: biometricAvailable, label: biometricLabelText });
  }, []);

  useEffect(() => {
    checkRequirements();
  }, [checkRequirements]);

  // Re-check face status and requirements whenever screen comes into focus
  // (e.g. returning from FaceRegistration)
  useFocusEffect(
    useCallback(() => {
      checkRequirements();
      if (user?.id) {
        hasFaceData(user.id).then(setFaceRegistered);
      }
    }, [checkRequirements, user?.id])
  );

  const fetchStatus = useCallback(async () => {
    setStatusError(null);
    try {
      const res = await getStatus();
      const { isCheckedIn: checkedIn, activeSession: session } = res.data;
      setIsCheckedIn(checkedIn);
      setActiveSession(session);

      if (checkedIn && !storeIsCheckedIn) {
        storeCheckIn();
      } else if (!checkedIn && storeIsCheckedIn) {
        await storeCheckOut();
      }
    } catch (error) {
      console.error('[Status] Error:', error.message);
      setStatusError(getApiErrorMessage(error));
    } finally {
      setStatusLoading(false);
      setRefreshing(false);
    }
  }, [storeIsCheckedIn, storeCheckIn, storeCheckOut]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await checkRequirements();
    await fetchStatus();
  }, [fetchStatus, checkRequirements]);

  useEffect(() => {
    initializeTimeStore();
    fetchStatus();
  }, [fetchStatus, initializeTimeStore]);

  useEffect(() => {
    if (isCheckedIn || storeIsCheckedIn) {
      timerRef.current = setInterval(() => tick(), 1000);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    } else {
      clearInterval(timerRef.current);
      pulseAnim.setValue(1);
    }
    return () => {
      clearInterval(timerRef.current);
      pulseAnim.setValue(1);
    };
  }, [isCheckedIn, storeIsCheckedIn, tick]);

  const handleCheckIn = async () => {
    if (isCheckedIn) {
      Alert.alert('Already Checked In', 'You are already checked in.');
      return;
    }

    // Step 1: Check WiFi
    const wifiValidation = await validateWifiConnection();
    setWifiStatus(wifiValidation);

    let checkInMethod = 'wifi';
    let locationData = null;

    if (wifiValidation.valid) {
      setConnectStatus({ valid: true, message: wifiValidation.message, type: 'wifi' });
    } else {
      // Step 2: WiFi unavailable — try location fallback
      const locResult = await validateAttendanceLocation();
      if (locResult.valid) {
        checkInMethod = 'location';
        locationData = locResult.location;
        setConnectStatus({ valid: true, message: locResult.message, type: 'location' });
      } else {
        setConnectStatus({ valid: false, message: wifiValidation.message, type: 'none' });
        Alert.alert(
          'Cannot Check In',
          `Please connect to "${getAllowedWifiName()}" WiFi or enable GPS location.\n\n${wifiValidation.message}`
        );
        return;
      }
    }

    navigation.navigate('FaceVerification', { mode: 'checkin', checkInMethod, location: locationData });
  };

  const handleCheckOut = () => {
    navigation.navigate('FaceVerification', { mode: 'checkout' });
  };

  const handleLogout = async () => {
    const go = async () => { await logOut(); };
    if (Platform.OS === 'web') {
      if (window.confirm('Sign out?')) await go();
    } else {
      Alert.alert('Sign Out', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: go },
      ]);
    }
  };

  if (statusLoading) {
    return (
      <LinearGradient colors={grad.screen} style={staticStyles.fill}>
        <ScrollView style={staticStyles.scroll} contentContainerStyle={staticStyles.inner}>
          <View style={staticStyles.topRow}>
            <View style={{ flex: 1 }}>
              <View style={{ height: 16, width: 100, backgroundColor: g.glass, borderRadius: 4 }} />
              <View style={{ height: 16, width: 180, backgroundColor: g.glass, borderRadius: 4, marginTop: 8 }} />
            </View>
            <View style={{ backgroundColor: g.glass, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: g.border }} />
          </View>
          <LinearGradient colors={grad.card} style={{ borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: g.border }}>
            <View style={staticStyles.statusRow}>
              <View style={[staticStyles.statusDot, { backgroundColor: g.glass }]} />
              <View style={{ height: 16, width: 120, backgroundColor: g.glass, borderRadius: 4 }} />
            </View>
            <View style={{ height: 16, width: '80%', backgroundColor: g.glass, borderRadius: 4, marginTop: 10 }} />
          </LinearGradient>
          <View style={staticStyles.buttonRow}>
            <View style={[staticStyles.btnShell, { backgroundColor: g.glass }]} />
            <View style={[staticStyles.btnShell, { backgroundColor: g.glass }]} />
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={grad.screen} style={staticStyles.fill}>
      <ScrollView
        style={staticStyles.scroll}
        contentContainerStyle={staticStyles.inner}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={g.accent} />}
      >
        {statusError ? (
          <View style={{ backgroundColor: g.errorBg, borderRadius: 16, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: g.errorBorder }}>
            <Text style={[staticStyles.errorBannerTitle, { color: '#ffb4c0' }]}>Could not load status</Text>
            <Text style={[staticStyles.errorBannerText, { color: g.textMuted }]}>{statusError}</Text>
            <TouchableOpacity
              style={{ marginTop: 12, alignSelf: 'flex-start', backgroundColor: g.accentSoft, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: g.borderGlow }}
              onPress={() => { setStatusLoading(true); fetchStatus(); }}
            >
              <Text style={[staticStyles.retryBtnText, { color: g.accent }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={staticStyles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: g.textMuted, fontSize: 13, fontWeight: '600' }}>Good {getGreeting()}</Text>
            <Text style={{ color: g.text, fontSize: 17, fontWeight: '800', marginTop: 4, maxWidth: 220 }} numberOfLines={1}>{user?.email}</Text>
          </View>
          <TouchableOpacity
            style={{ backgroundColor: g.glass, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: g.border }}
            onPress={handleLogout}
          >
            <Text style={{ color: g.coral, fontSize: 13, fontWeight: '700' }}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* Connection Status (WiFi or Location fallback) */}
        {!isCheckedIn && (
          <LinearGradient
            colors={
              connectStatus.type === 'wifi' ? [g.mintSoft, grad.card[1]] :
              connectStatus.type === 'location' ? ['rgba(74,144,226,0.15)', grad.card[1]] :
              connectStatus.type === 'checking' ? [g.glass, grad.card[1]] :
              [g.coralSoft, grad.card[1]]
            }
            style={{
              borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1,
              borderColor:
                connectStatus.type === 'wifi' ? g.mint :
                connectStatus.type === 'location' ? '#4a90e2' :
                connectStatus.type === 'checking' ? g.border :
                g.coral,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>
                {connectStatus.type === 'wifi' ? '📶' :
                 connectStatus.type === 'location' ? '📍' :
                 connectStatus.type === 'checking' ? '🔄' : '⚠️'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 13, fontWeight: '700',
                  color: connectStatus.type === 'wifi' ? g.mint :
                         connectStatus.type === 'location' ? '#4a90e2' :
                         connectStatus.type === 'checking' ? g.textMuted : g.coral,
                }}>
                  {connectStatus.type === 'wifi' ? 'WiFi Connected' :
                   connectStatus.type === 'location' ? 'Using GPS Location' :
                   connectStatus.type === 'checking' ? 'Checking connection...' :
                   'No Connection'}
                </Text>
                <Text style={{ color: g.textMuted, fontSize: 12, marginTop: 2 }}>
                  {connectStatus.type === 'none'
                    ? `Connect to "${getAllowedWifiName()}" WiFi or enable location`
                    : connectStatus.message}
                </Text>
              </View>
            </View>
          </LinearGradient>
        )}

        {/* Face Registration Banner */}
        {!isCheckedIn && !faceRegistered && (
          <LinearGradient
            colors={[g.coralSoft, grad.card[1]]}
            style={{ borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: g.coral }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>👤</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: g.coral, fontSize: 13, fontWeight: '700' }}>Face Not Registered</Text>
                <Text style={{ color: g.textMuted, fontSize: 12, marginTop: 2 }}>Register your face in Settings before checking in</Text>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: g.coral, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}
                onPress={() => navigation.navigate('Settings')}
              >
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Go</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        )}

        {/* Biometric Status */}
        {!isCheckedIn && biometricStatus.available && (
          <LinearGradient
            colors={[g.accentSoft, grad.card[1]]}
            style={{ borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: g.accent }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>🔒</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: g.accent, fontSize: 13, fontWeight: '700' }}>{biometricStatus.label} Required</Text>
                <Text style={{ color: g.textMuted, fontSize: 12, marginTop: 2 }}>{biometricStatus.label} verification required to check in</Text>
              </View>
            </View>
          </LinearGradient>
        )}

        <LinearGradient colors={grad.card} style={{ borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: g.border }}>
          <View style={staticStyles.statusRow}>
            <View style={[staticStyles.statusDot, { backgroundColor: isCheckedIn ? g.mint : g.warn }]} />
            <Text style={[staticStyles.statusText, { color: isCheckedIn ? g.mint : g.warn }]}>
              {isCheckedIn ? 'On the clock' : 'Off the clock'}
            </Text>
          </View>
          <Text style={[staticStyles.statusSub, { color: g.textMuted }]}>
            {isCheckedIn ? 'Your session is live — check out when you wrap up.' : 'Tap check in when you start working.'}
          </Text>
        </LinearGradient>

        {/* Total Time Card */}
        <LinearGradient colors={grad.card} style={{ borderRadius: 24, padding: 24, marginBottom: 20, borderWidth: 1, borderColor: g.border }}>
          <View style={staticStyles.totalTimeHeader}>
            <Text style={{ color: g.textMuted, fontSize: 13, fontWeight: '600' }}>Total Accumulated Time</Text>
            <View style={[staticStyles.totalTimeBadge, { backgroundColor: g.accentSoft }]}>
              <Text style={[staticStyles.totalTimeBadgeText, { color: g.accent }]}>All Time</Text>
            </View>
          </View>
          <Text style={[staticStyles.totalTimeValue, { color: g.text }]}>{formatDuration(totalTimeSeconds + currentSessionSeconds)}</Text>
          <View style={[staticStyles.timeStatsRow, { borderTopWidth: 1, borderTopColor: g.border }]}>
            <View style={staticStyles.timeStat}>
              <Text style={[staticStyles.timeStatValue, { color: g.text }]}>
                {formatDurationCompact(getTodayTotal() + (isCheckedIn ? currentSessionSeconds : 0))}
              </Text>
              <Text style={[staticStyles.timeStatLabel, { color: g.textMuted }]}>Today</Text>
            </View>
            <View style={[staticStyles.timeStatDivider, { backgroundColor: g.border }]} />
            <View style={staticStyles.timeStat}>
              <Text style={[staticStyles.timeStatValue, { color: g.text }]}>
                {formatDurationCompact(getWeekTotal() + (isCheckedIn ? currentSessionSeconds : 0))}
              </Text>
              <Text style={[staticStyles.timeStatLabel, { color: g.textMuted }]}>This Week</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Session Timer */}
        {isCheckedIn ? (
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <LinearGradient
              colors={[g.mintSoft, isDark ? 'rgba(20,20,40,0.5)' : 'rgba(248,249,250,0.5)']}
              style={{ borderRadius: 22, padding: 24, alignItems: 'center', marginBottom: 22, borderWidth: 1, borderColor: 'rgba(62,232,199,0.35)' }}
            >
              <View style={staticStyles.sessionHeader}>
                <View style={[staticStyles.liveIndicator, { backgroundColor: g.mint }]} />
                <Text style={[staticStyles.timerLabel, { color: g.mint }]}>Current Session</Text>
              </View>
              <Text style={[staticStyles.timerValue, { color: g.mint }]}>{formatDuration(currentSessionSeconds)}</Text>
              {activeSession ? (
                <Text style={[staticStyles.timerSub, { color: g.textDim }]}>Started {formatTime(activeSession.checkInTime)}</Text>
              ) : null}
            </LinearGradient>
          </Animated.View>
        ) : (
          <LinearGradient
            colors={grad.card}
            style={{ borderRadius: 22, padding: 32, alignItems: 'center', marginBottom: 22, borderWidth: 1, borderColor: g.border, borderStyle: 'dashed' }}
          >
            <Text style={{ color: g.textMuted, fontSize: 16, fontWeight: '600' }}>No active session</Text>
            <Text style={{ color: g.textDim, fontSize: 13, marginTop: 6 }}>Check in to start tracking time</Text>
          </LinearGradient>
        )}

        <View style={staticStyles.buttonRow}>
          <TouchableOpacity
            style={[(isCheckedIn || actionLoading) && staticStyles.btnOff, checkInPressed && staticStyles.btnPressed, staticStyles.btnShell]}
            onPressIn={() => setCheckInPressed(true)}
            onPressOut={() => setCheckInPressed(false)}
            onPress={handleCheckIn}
            disabled={isCheckedIn || actionLoading}
            activeOpacity={0.9}
          >
            <LinearGradient colors={isCheckedIn || actionLoading ? ['#2a3d35', '#1a1a28'] : grad.mintBtn} style={staticStyles.btnGrad}>
              {actionLoading && !isCheckedIn ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={staticStyles.btnEmoji}>▶</Text>
                  <Text style={staticStyles.btnLabel}>Check in</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={[(!isCheckedIn || actionLoading) && staticStyles.btnOff, checkOutPressed && staticStyles.btnPressed, staticStyles.btnShell]}
            onPressIn={() => setCheckOutPressed(true)}
            onPressOut={() => setCheckOutPressed(false)}
            onPress={handleCheckOut}
            disabled={!isCheckedIn || actionLoading}
            activeOpacity={0.9}
          >
            <LinearGradient colors={!isCheckedIn || actionLoading ? ['#3d2a32', '#1a1a28'] : grad.coralBtn} style={staticStyles.btnGrad}>
              {actionLoading && isCheckedIn ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={staticStyles.btnEmoji}>■</Text>
                  <Text style={staticStyles.btnLabel}>Check out</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={{ backgroundColor: g.glass, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: g.border }}>
          <Text style={[staticStyles.infoTitle, { color: g.textMuted }]}>Today</Text>
          <Text style={[staticStyles.infoDate, { color: g.text }]}>{new Date().toDateString()}</Text>
          <Text style={[staticStyles.infoHint, { color: g.textDim }]}>Pull down to refresh · Time accumulates across sessions</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}
