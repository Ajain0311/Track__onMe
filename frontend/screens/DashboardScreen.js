// screens/DashboardScreen.js — optimized with parallel data loading, goal progress, streak

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, RefreshControl, Platform,
  Vibration, Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { getStatus, getNotifications, getMe, getApiErrorMessage } from '../services/api';
import { logOut } from '../services/authService';
import useAuthStore from '../store/authStore';
import useTimeStore from '../store/timeStore';
import useThemeStore from '../store/themeStore';
import useGoalStore from '../store/goalStore';
import { isBiometricAvailable, getBiometricLabel } from '../services/biometricAuth';
import { validateWifiConnection, getAllowedWifiName } from '../services/wifiService';
import { validateAttendanceLocation } from '../services/locationService';
import { hasFaceData } from '../services/faceRecognitionService';
import { getFaceStatusFromServer } from '../services/api';
import OnboardingCard from '../components/OnboardingCard';

const triggerHaptic = (type = 'light') => {
  if (Platform.OS === 'web') return;
  try {
    const Haptics = require('expo-haptics');
    if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    Vibration.vibrate(type === 'success' ? 50 : 30);
  }
};

const pad2 = (n) => String(n).padStart(2, '0');
const formatDuration = (s) => `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
const formatDurationCompact = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return '0m';
};
const formatTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
const formatClockTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const formatDateFull = (d) => d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
const getGreeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const getInitials = (email) => email ? email.charAt(0).toUpperCase() : '?';

export default function DashboardScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const { colors: g, gradients: grad, isDark } = useThemeStore();
  const {
    isCheckedIn: storeIsCheckedIn,
    currentSessionSeconds,
    totalTimeSeconds,
    dailyTotals,
    checkIn: storeCheckIn,
    checkOut: storeCheckOut,
    tick,
    getTodayTotal,
    getWeekTotal,
    initialize: initializeTimeStore,
  } = useTimeStore();
  const { goals, getDailyGoalProgress, computeStreak, initialize: initGoals } = useGoalStore();

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checkInPressed, setCheckInPressed] = useState(false);
  const [checkOutPressed, setCheckOutPressed] = useState(false);
  const [connectStatus, setConnectStatus] = useState({ valid: false, message: 'Checking...', type: 'checking' });
  const [faceRegistered, setFaceRegistered] = useState(false);
  // true = face registered on server (authoritative), false = not registered or unknown
  const [faceRegisteredOnServer, setFaceRegisteredOnServer] = useState(false);
  const [clockTime, setClockTime] = useState(new Date());
  const [unreadCount, setUnreadCount] = useState(0);
  const [displayName, setDisplayName] = useState(null);
  const [onboardingSteps, setOnboardingSteps] = useState(null);

  const timerRef = useRef(null);
  const clockRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const dotAnim = useRef(new Animated.Value(1)).current;
  const goalBarAnim = useRef(new Animated.Value(0)).current;
  const cardFadeAnim = useRef(new Animated.Value(0)).current;
  const storeCheckedInRef = useRef(storeIsCheckedIn);
  useEffect(() => { storeCheckedInRef.current = storeIsCheckedIn; }, [storeIsCheckedIn]);

  const effectiveIsCheckedIn = isCheckedIn || storeIsCheckedIn;

  // ── Clock ──
  useEffect(() => {
    clockRef.current = setInterval(() => setClockTime(new Date()), 30000);
    return () => clearInterval(clockRef.current);
  }, []);

  // ── Requirements check ──
  const checkRequirements = useCallback(async () => {
    const wifiValidation = await validateWifiConnection();
    if (wifiValidation.valid) {
      setConnectStatus({ valid: true, message: wifiValidation.message, type: 'wifi' });
    } else {
      const locResult = await validateAttendanceLocation();
      if (locResult.valid) {
        setConnectStatus({ valid: true, message: locResult.message, type: 'location' });
      } else {
        setConnectStatus({ valid: false, message: wifiValidation.message, type: 'none' });
      }
    }
  }, []);

  // ── Status fetch ──
  const fetchStatus = useCallback(async (opts = {}) => {
    const { silent = false } = opts;
    if (!silent) setStatusError(null);
    try {
      const res = await getStatus();
      const { isCheckedIn: checkedIn, activeSession: session } = res.data;
      setIsCheckedIn(checkedIn);
      setActiveSession(session);

      // Sync local store with server state.
      // When syncing from server (not a fresh check-in) we pass null SSID so the
      // WiFi monitor won't auto-checkout this restored session.
      if (checkedIn && !storeCheckedInRef.current) {
        // Seed the timer with actual elapsed time so it doesn't reset to 0:00:00
        // on app restart or pull-to-refresh while the user is checked in.
        const elapsedSeconds = session?.checkInTime
          ? Math.max(0, Math.floor((Date.now() - new Date(session.checkInTime).getTime()) / 1000))
          : 0;
        storeCheckIn(null, elapsedSeconds);
      } else if (!checkedIn && storeCheckedInRef.current) {
        await storeCheckOut();
      }
    } catch (error) {
      if (!silent) setStatusError(getApiErrorMessage(error));
    } finally {
      setStatusLoading(false);
      setRefreshing(false);
    }
  }, [storeCheckIn, storeCheckOut]);

  // ── Re-sync status each time the screen gains focus (e.g. returning from check-in/out) ──
  useFocusEffect(
    useCallback(() => {
      checkRequirements();
      if (user?.id) {
        hasFaceData(user.id).then(setFaceRegistered);
        // Also check server — this is the authoritative source
        getFaceStatusFromServer()
          .then((r) => {
            const reg = !!r.data?.registered;
            setFaceRegisteredOnServer(reg);
            setOnboardingSteps((prev) => ({ ...(prev || {}), face: reg }));
          })
          .catch(() => {}); // fail-soft — don't block the dashboard
      }
      // Silently refresh status so the timer & button states stay accurate
      // without resetting the loading skeleton every time.
      fetchStatus({ silent: true });

      // Load display name + onboarding state from profile
      getMe()
        .then((r) => {
          if (r.data?.profile?.displayName) setDisplayName(r.data.profile.displayName);
          // Onboarding: check profile has a displayName set (non-empty)
          const profileDone = !!(r.data?.profile?.displayName);
          setOnboardingSteps((prev) => ({ ...(prev || {}), profile: profileDone }));
        })
        .catch(() => {});

      // Best-effort unread notification count, also re-polled every 60s
      // while this screen is focused so the bell badge stays current.
      const poll = () => {
        getNotifications(true)
          .then((r) => setUnreadCount(r.data?.notifications?.length || 0))
          .catch(() => {});
      };
      poll();
      const intervalId = setInterval(poll, 60_000);
      return () => clearInterval(intervalId);
    }, [checkRequirements, fetchStatus, user?.id])
  );

  // ── Mount: parallel fetch for faster load ──
  useEffect(() => {
    initializeTimeStore();
    initGoals(user?.id);
    // Run status + requirements in parallel instead of sequentially
    Promise.all([fetchStatus(), checkRequirements()]);
    if (user?.id) {
        hasFaceData(user.id).then(setFaceRegistered);
        getFaceStatusFromServer()
          .then((r) => {
            const reg = !!r.data?.registered;
            setFaceRegisteredOnServer(reg);
            setOnboardingSteps((prev) => ({ ...(prev || {}), face: reg }));
          })
          .catch(() => {});
      }
  }, []);

  // ── Animate cards in after load ──
  useEffect(() => {
    if (!statusLoading) {
      Animated.timing(cardFadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
  }, [statusLoading]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([checkRequirements(), fetchStatus()]);
  }, [fetchStatus, checkRequirements]);

  // ── Goal bar animation ──
  const todayTotal = getTodayTotal() + (effectiveIsCheckedIn ? currentSessionSeconds : 0);
  const goalProgress = getDailyGoalProgress(todayTotal);

  useEffect(() => {
    Animated.timing(goalBarAnim, {
      toValue: goalProgress,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [goalProgress]);

  // ── Timer + pulse ──
  useEffect(() => {
    if (effectiveIsCheckedIn) {
      timerRef.current = setInterval(() => tick(), 1000);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.03, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotAnim, { toValue: 0.25, duration: 700, useNativeDriver: true }),
          Animated.timing(dotAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      clearInterval(timerRef.current);
      pulseAnim.stopAnimation(); dotAnim.stopAnimation();
      pulseAnim.setValue(1); dotAnim.setValue(1);
    }
    return () => clearInterval(timerRef.current);
  }, [effectiveIsCheckedIn, tick]);

  // ── Actions ──
  const handleCheckIn = async () => {
    if (effectiveIsCheckedIn) return;
    triggerHaptic('light');
    navigation.navigate('LocationPicker', { mode: 'checkin' });
  };

  const handleCheckOut = () => {
    triggerHaptic('light');
    navigation.navigate('FaceVerification', { mode: 'checkout' });
  };

  const handleLogout = async () => {
    const go = async () => { await logOut(); };
    if (Platform.OS === 'web') {
      if (window.confirm('Sign out?')) await go();
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: go },
      ]);
    }
  };

  // ── Derived values ──
  const weekTotal = getWeekTotal() + (effectiveIsCheckedIn ? currentSessionSeconds : 0);
  const allTotal = totalTimeSeconds + currentSessionSeconds;
  const streak = computeStreak(dailyTotals);
  const goalPct = Math.round(goalProgress * 100);

  // ── Skeleton loading ──
  if (statusLoading) {
    return (
      <LinearGradient colors={grad.screen} style={s.fill}>
        <ScrollView style={s.scroll} contentContainerStyle={s.inner}>
          {/* Header skeleton */}
          <View style={s.topRow}>
            <View style={{ flex: 1 }}>
              <View style={{ height: 12, width: 88, backgroundColor: g.glass, borderRadius: 6 }} />
              <View style={{ height: 16, width: 180, backgroundColor: g.glass, borderRadius: 6, marginTop: 9 }} />
            </View>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: g.glass }} />
          </View>
          {/* Status card skeleton */}
          <LinearGradient colors={grad.card} style={{ borderRadius: 22, padding: 22, marginBottom: 18, borderWidth: 1, borderColor: g.border }}>
            <View style={{ height: 18, width: 130, backgroundColor: g.glass, borderRadius: 6, marginBottom: 12 }} />
            <View style={{ height: 12, width: '70%', backgroundColor: g.glass, borderRadius: 6 }} />
          </LinearGradient>
          {/* Buttons skeleton */}
          <View style={s.buttonRow}>
            <View style={[s.btnShell, { backgroundColor: g.glass, height: 76 }]} />
            <View style={[s.btnShell, { backgroundColor: g.glass, height: 76 }]} />
          </View>
          {/* Timer skeleton */}
          <LinearGradient colors={grad.card} style={{ borderRadius: 24, padding: 24, marginBottom: 18, borderWidth: 1, borderColor: g.border }}>
            <View style={{ height: 12, width: 110, backgroundColor: g.glass, borderRadius: 6, marginBottom: 12 }} />
            <View style={{ height: 44, width: 170, backgroundColor: g.glass, borderRadius: 6 }} />
          </LinearGradient>
        </ScrollView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.inner}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={g.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Error banner ── */}
        {statusError ? (
          <View style={[s.errorBanner, { backgroundColor: g.errorBg, borderColor: g.errorBorder }]}>
            <Text style={[s.errorTitle, { color: '#ffb4c0' }]}>Could not load status</Text>
            <Text style={[s.errorBody, { color: g.textMuted }]}>{statusError}</Text>
            <TouchableOpacity
              style={[s.retryBtn, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}
              onPress={() => { setStatusLoading(true); fetchStatus(); }}
            >
              <Text style={[s.retryText, { color: g.accent }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Onboarding checklist (shown until all steps complete) ── */}
        {onboardingSteps && (!onboardingSteps.profile || !onboardingSteps.face) && (
          <OnboardingCard steps={onboardingSteps} navigation={navigation} />
        )}

        {/* ── Header row ── */}
        <View style={s.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: g.textMuted, fontSize: 13, fontWeight: '600' }}>{getGreeting()}</Text>
            <Text style={{ color: g.text, fontSize: 15, fontWeight: '800', marginTop: 3, maxWidth: 200 }} numberOfLines={1}>
              {displayName || user?.email?.split('@')[0] || user?.email}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {streak > 0 && (
                <View style={[s.streakBadge, { backgroundColor: isDark ? 'rgba(255,179,71,0.18)' : 'rgba(255,179,71,0.15)', borderColor: 'rgba(255,179,71,0.5)' }]}>
                  <Text style={{ fontSize: 13 }}>🔥</Text>
                  <Text style={{ color: '#ffb347', fontSize: 12, fontWeight: '800', marginLeft: 4 }}>{streak}d</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => navigation.navigate('Notifications')}
                style={[s.bellBtn, { backgroundColor: g.glass, borderColor: g.border }]}
                accessibilityLabel="Notifications"
              >
                <Text style={{ fontSize: 16 }}>🔔</Text>
                {unreadCount > 0 && (
                  <View style={[s.bellDot, { backgroundColor: g.coral || '#e5534b' }]}>
                    <Text style={s.bellDotText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleLogout}
                style={[s.avatarCircle, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}
              >
                <Text style={{ color: g.accent, fontSize: 16, fontWeight: '900' }}>{(displayName || user?.email || '?').charAt(0).toUpperCase()}</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: g.text, fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] }}>
              {formatClockTime(clockTime)}
            </Text>
            <Text style={{ color: g.textMuted, fontSize: 11, fontWeight: '600' }}>
              {formatDateFull(clockTime)}
            </Text>
          </View>
        </View>

        {/* ── Status card ── */}
        <LinearGradient
          colors={effectiveIsCheckedIn
            ? [isDark ? 'rgba(62,232,199,0.12)' : 'rgba(62,232,199,0.08)', grad.card[1]]
            : grad.card}
          style={[s.statusCard, {
            borderColor: effectiveIsCheckedIn ? 'rgba(62,232,199,0.5)' : g.border,
            shadowColor: effectiveIsCheckedIn ? g.mint : 'transparent',
          }]}
        >
          <View style={s.statusRow}>
            <Animated.View style={[s.statusDot, { backgroundColor: effectiveIsCheckedIn ? g.mint : g.warn, opacity: effectiveIsCheckedIn ? dotAnim : 1 }]} />
            <Text style={[s.statusText, { color: effectiveIsCheckedIn ? g.mint : g.warn }]}>
              {effectiveIsCheckedIn ? 'On the clock' : 'Off the clock'}
            </Text>
            {effectiveIsCheckedIn && (
              <View style={[s.liveBadge, { backgroundColor: 'rgba(62,232,199,0.18)', borderColor: 'rgba(62,232,199,0.4)' }]}>
                <Text style={{ color: g.mint, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>LIVE</Text>
              </View>
            )}
          </View>
          <Text style={[s.statusSub, { color: g.textMuted }]}>
            {effectiveIsCheckedIn
              ? activeSession ? `Started at ${formatTime(activeSession.checkInTime)}` : 'Your session is live.'
              : 'Tap check in when you start working.'}
          </Text>
        </LinearGradient>

        {/* ── Check In / Out buttons ── */}
        <View style={s.buttonRow}>
          <TouchableOpacity
            style={[s.btnShell, (effectiveIsCheckedIn || actionLoading) && s.btnOff, checkInPressed && s.btnPressed]}
            onPressIn={() => setCheckInPressed(true)}
            onPressOut={() => setCheckInPressed(false)}
            onPress={handleCheckIn}
            disabled={effectiveIsCheckedIn || actionLoading}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={effectiveIsCheckedIn || actionLoading ? ['#1e3028', '#131323'] : grad.mintBtn}
              style={s.btnGrad}
            >
              {actionLoading && !effectiveIsCheckedIn ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <Text style={[s.btnEmoji, { opacity: effectiveIsCheckedIn ? 0.5 : 1 }]}>▶</Text>
                  <Text style={s.btnLabel}>Check In</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btnShell, (!effectiveIsCheckedIn || actionLoading) && s.btnOff, checkOutPressed && s.btnPressed]}
            onPressIn={() => setCheckOutPressed(true)}
            onPressOut={() => setCheckOutPressed(false)}
            onPress={handleCheckOut}
            disabled={!effectiveIsCheckedIn || actionLoading}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={!effectiveIsCheckedIn || actionLoading ? ['#30181e', '#131323'] : grad.coralBtn}
              style={s.btnGrad}
            >
              {actionLoading && effectiveIsCheckedIn ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <Text style={[s.btnEmoji, { opacity: !effectiveIsCheckedIn ? 0.5 : 1 }]}>■</Text>
                  <Text style={s.btnLabel}>Check Out</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── QR alternative ── */}
        {Platform.OS !== 'web' && (
          <TouchableOpacity
            style={[s.qrBtn, { borderColor: g.border, backgroundColor: g.glass }]}
            onPress={() => navigation.navigate('QrScan')}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 15, marginRight: 6 }}>📷</Text>
            <Text style={[s.qrBtnTxt, { color: g.textMuted }]}>Scan Location QR</Text>
          </TouchableOpacity>
        )}

        {/* ── Live session timer ── */}
        {effectiveIsCheckedIn ? (
          <Animated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: 16 }}>
            <LinearGradient
              colors={[isDark ? 'rgba(62,232,199,0.10)' : 'rgba(62,232,199,0.07)', isDark ? 'rgba(20,20,40,0.6)' : 'rgba(248,249,250,0.6)']}
              style={[s.timerCard, { borderColor: 'rgba(62,232,199,0.4)' }]}
            >
              <View style={s.timerHeader}>
                <Animated.View style={[s.timerDot, { backgroundColor: g.mint, opacity: dotAnim }]} />
                <Text style={[s.timerLabel, { color: g.mint }]}>Current Session</Text>
              </View>
              <Text style={[s.timerValue, { color: g.mint }]}>{formatDuration(currentSessionSeconds)}</Text>
              {activeSession && (
                <Text style={[s.timerSub, { color: g.textDim }]}>Started at {formatTime(activeSession.checkInTime)}</Text>
              )}
            </LinearGradient>
          </Animated.View>
        ) : (
          <LinearGradient
            colors={grad.card}
            style={[s.timerCard, { borderColor: g.border, borderStyle: 'dashed', marginBottom: 16 }]}
          >
            <Text style={{ color: g.textMuted, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>No active session</Text>
            <Text style={{ color: g.textDim, fontSize: 12, marginTop: 5, textAlign: 'center' }}>Check in to start tracking</Text>
          </LinearGradient>
        )}

        {/* ── Daily goal progress ── */}
        <LinearGradient colors={grad.card} style={[s.goalCard, { borderColor: g.border }]}>
          <View style={s.goalHeader}>
            <View>
              <Text style={{ color: g.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>DAILY GOAL</Text>
              <Text style={{ color: g.text, fontSize: 17, fontWeight: '800', marginTop: 2 }}>
                {formatDurationCompact(todayTotal)}
                <Text style={{ color: g.textMuted, fontSize: 13, fontWeight: '600' }}> / {goals.dailyHoursGoal}h</Text>
              </Text>
            </View>
            <View style={[s.goalPctBadge, {
              backgroundColor: goalPct >= 100 ? g.mintSoft : goalPct >= 50 ? g.accentSoft : 'rgba(255,123,156,0.15)',
              borderColor: goalPct >= 100 ? g.mint : goalPct >= 50 ? g.accent : g.coral,
            }]}>
              <Text style={{
                color: goalPct >= 100 ? g.mint : goalPct >= 50 ? g.accent : g.coral,
                fontSize: 14, fontWeight: '900',
              }}>{goalPct}%</Text>
            </View>
          </View>
          <View style={[s.goalTrack, { backgroundColor: g.glass }]}>
            <Animated.View style={[s.goalFill, {
              width: goalBarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: goalPct >= 100 ? g.mint : goalPct >= 60 ? g.accent : g.coral,
            }]} />
          </View>
          {goalPct >= 100 && (
            <Text style={{ color: g.mint, fontSize: 12, fontWeight: '700', marginTop: 8 }}>
              🎉 Goal achieved! Great work today.
            </Text>
          )}
        </LinearGradient>

        {/* ── Time stats card ── */}
        <LinearGradient colors={grad.card} style={[s.statsCard, { borderColor: g.border }]}>
          <View style={s.statsHeader}>
            <Text style={{ color: g.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>TIME TRACKER</Text>
            <View style={[s.statsBadge, { backgroundColor: g.accentSoft }]}>
              <Text style={{ color: g.accent, fontSize: 10, fontWeight: '800' }}>ALL TIME</Text>
            </View>
          </View>
          <Text style={[s.statsTotal, { color: g.text }]}>{formatDuration(allTotal)}</Text>
          <View style={[s.statsRow, { borderTopColor: g.border }]}>
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: g.text }]}>{formatDurationCompact(todayTotal)}</Text>
              <Text style={[s.statLabel, { color: g.textMuted }]}>Today</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: g.border }]} />
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: g.text }]}>{formatDurationCompact(weekTotal)}</Text>
              <Text style={[s.statLabel, { color: g.textMuted }]}>This Week</Text>
            </View>
            <View style={[s.statDivider, { backgroundColor: g.border }]} />
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: streak > 0 ? '#ffb347' : g.text }]}>
                {streak > 0 ? `🔥 ${streak}` : '0'}
              </Text>
              <Text style={[s.statLabel, { color: g.textMuted }]}>Day Streak</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Connection status ── */}
        {!effectiveIsCheckedIn && (
          <LinearGradient
            colors={
              connectStatus.type === 'wifi' ? [g.mintSoft, grad.card[1]] :
              connectStatus.type === 'location' ? ['rgba(74,144,226,0.15)', grad.card[1]] :
              connectStatus.type === 'checking' ? [g.glass, grad.card[1]] :
              [g.coralSoft, grad.card[1]]
            }
            style={[s.infoCard, {
              borderColor:
                connectStatus.type === 'wifi' ? g.mint :
                connectStatus.type === 'location' ? '#4a90e2' :
                connectStatus.type === 'checking' ? g.border : g.coral,
            }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, marginRight: 10 }}>
                {connectStatus.type === 'wifi' ? '📶' : connectStatus.type === 'location' ? '📍' : connectStatus.type === 'checking' ? '🔄' : '⚠️'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 13, fontWeight: '700',
                  color: connectStatus.type === 'wifi' ? g.mint : connectStatus.type === 'location' ? '#4a90e2' : connectStatus.type === 'checking' ? g.textMuted : g.coral,
                }}>
                  {connectStatus.type === 'wifi' ? 'WiFi Connected' : connectStatus.type === 'location' ? 'Using GPS Location' : connectStatus.type === 'checking' ? 'Checking connection…' : 'No Connection'}
                </Text>
                <Text style={{ color: g.textMuted, fontSize: 11, marginTop: 2 }}>
                  {connectStatus.type === 'none' ? `Connect to "${getAllowedWifiName()}" WiFi or enable location` : connectStatus.message}
                </Text>
              </View>
            </View>
          </LinearGradient>
        )}

        {/* ── Face not registered (native: check both local + server) ── */}
        {!effectiveIsCheckedIn && Platform.OS !== 'web' && (!faceRegistered || !faceRegisteredOnServer) && (
          <LinearGradient colors={[g.coralSoft, grad.card[1]]} style={[s.infoCard, { borderColor: g.coral }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, marginRight: 10 }}>👤</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: g.coral, fontSize: 13, fontWeight: '700' }}>
                  {!faceRegistered ? 'Face Not Registered' : 'Face Not Synced to Server'}
                </Text>
                <Text style={{ color: g.textMuted, fontSize: 11, marginTop: 2 }}>
                  {!faceRegistered
                    ? 'Register your face in Settings → Register Face'
                    : 'Your face data needs to be re-registered and synced. Go to Settings → Register Face'}
                </Text>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: g.coral, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 }}
                onPress={() => navigation.navigate('Settings')}
              >
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Go →</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        )}

        {/* ── Footer ── */}
        <View style={[s.footer, { borderColor: g.border }]}>
          <Text style={{ color: g.textDim, fontSize: 11, textAlign: 'center' }}>
            Pull to refresh · Time accumulates across sessions
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flex: 1 },
  inner: { padding: 20, paddingTop: 54, paddingBottom: 100 },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },

  streakBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  avatarCircle: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5,
  },
  bellBtn: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  bellDot: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 4,
    justifyContent: 'center', alignItems: 'center',
  },
  bellDotText: { color: '#fff', fontSize: 10, fontWeight: '900' },

  statusCard: {
    borderRadius: 22, padding: 20, marginBottom: 16,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 6,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  statusDot: { width: 11, height: 11, borderRadius: 5.5, marginRight: 10 },
  statusText: { fontSize: 19, fontWeight: '900', flex: 1 },
  statusSub: { fontSize: 13, lineHeight: 20 },
  liveBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, marginLeft: 8 },

  buttonRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  qrBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, paddingVertical: 10, marginBottom: 16 },
  qrBtnTxt: { fontSize: 13, fontWeight: '700' },
  btnShell: { flex: 1, borderRadius: 18, overflow: 'hidden', elevation: 8, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  btnOff: { opacity: 0.38 },
  btnPressed: { transform: [{ scale: 0.965 }] },
  btnGrad: { paddingVertical: 22, alignItems: 'center', justifyContent: 'center' },
  btnEmoji: { fontSize: 16, color: 'rgba(255,255,255,0.85)', marginBottom: 4 },
  btnLabel: { color: '#fff', fontSize: 15, fontWeight: '800' },

  timerCard: { borderRadius: 22, padding: 26, alignItems: 'center', borderWidth: 1.5 },
  timerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  timerDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  timerLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
  timerValue: { fontSize: 52, fontWeight: '900', fontVariant: ['tabular-nums'], lineHeight: 56 },
  timerSub: { fontSize: 13, marginTop: 8 },

  goalCard: { borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1 },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  goalPctBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  goalTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  goalFill: { height: '100%', borderRadius: 4 },

  statsCard: { borderRadius: 24, padding: 22, marginBottom: 14, borderWidth: 1 },
  statsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statsBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statsTotal: { fontSize: 36, fontWeight: '900', marginBottom: 14, fontVariant: ['tabular-nums'] },
  statsRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingTop: 14 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', marginBottom: 3 },
  statLabel: { fontSize: 11, fontWeight: '600' },
  statDivider: { width: 1, height: 28 },

  infoCard: { borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1 },

  errorBanner: { borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1 },
  errorTitle: { fontSize: 15, fontWeight: '800', marginBottom: 6 },
  errorBody: { fontSize: 13, lineHeight: 20 },
  retryBtn: { marginTop: 12, alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  retryText: { fontWeight: '800', fontSize: 14 },

  footer: { borderTopWidth: 1, paddingTop: 16, marginTop: 4 },
});
