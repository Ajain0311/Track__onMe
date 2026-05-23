// screens/SettingsScreen.js — Settings with goals, theme, face recognition, data management

import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import useTimeStore from '../store/timeStore';
import useAuthStore from '../store/authStore';
import useGoalStore from '../store/goalStore';
import { logOut } from '../services/authService';
import { getMe } from '../services/api';
import { hasFaceData, deleteFaceData } from '../services/faceRecognitionService';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export default function SettingsScreen({ navigation }) {
  const { colors: g, gradients: grad, themeMode, setThemeMode } = useThemeStore();
  const { totalTimeSeconds, sessions, resetAll, dailyTotals } = useTimeStore();
  const { user, isAdmin, setIsAdmin } = useAuthStore();
  const { goals, updateGoals, computeStreak } = useGoalStore();

  const [isResetting, setIsResetting] = useState(false);
  const [faceRegistered, setFaceRegistered] = useState(false);
  const [appVersion] = useState('1.0.0');
  const [isRetryingRole, setIsRetryingRole] = useState(false);
  const [roleRetryMsg, setRoleRetryMsg] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        hasFaceData(user.id).then(setFaceRegistered);
      }
    }, [user?.id])
  );

  const streak = computeStreak(dailyTotals || {});
  const totalHours = Math.floor(totalTimeSeconds / 3600);
  const avgHours = sessions.length > 0
    ? Math.round((totalTimeSeconds / sessions.length / 3600) * 10) / 10
    : 0;

  const handleRegisterFace = () => navigation.navigate('FaceRegistration');

  const handleDeleteFace = () => {
    Alert.alert(
      'Delete Face Data?',
      'This will remove your registered face data. You will need to re-register to use face recognition.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await deleteFaceData(user.id);
              setFaceRegistered(false);
              Alert.alert('Done', 'Face data deleted successfully.');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete face data: ' + error.message);
            }
          },
        },
      ]
    );
  };

  const handleResetData = () => {
    const confirmReset = async () => {
      setIsResetting(true);
      try {
        await resetAll();
        Alert.alert('Done', 'All time tracking data has been reset.');
      } catch {
        Alert.alert('Error', 'Failed to reset data. Please try again.');
      } finally {
        setIsResetting(false);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Reset all data? This cannot be undone.')) confirmReset();
    } else {
      Alert.alert('Reset All Data?', 'This will clear all your accumulated time and session history. This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: confirmReset },
      ]);
    }
  };

  const handleRetryRole = async () => {
    setIsRetryingRole(true);
    setRoleRetryMsg(null);
    try {
      const res = await getMe();
      const role = res.data?.role;
      setIsAdmin(role === 'admin');
      setRoleRetryMsg(role === 'admin' ? '✓ Admin access granted! Switch to the Admin tab.' : '✗ This account does not have admin role.');
    } catch {
      setRoleRetryMsg('✗ Could not reach server. Try again in a moment.');
    } finally {
      setIsRetryingRole(false);
    }
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

  const adjustGoal = (field, delta) => {
    const limits = { dailyHoursGoal: [1, 16], weeklyDaysGoal: [1, 7] };
    const [min, max] = limits[field];
    updateGoals({ [field]: clamp((goals[field] || 0) + delta, min, max) }, user?.id);
  };

  // ── Sub-components ────────────────────────────────────────────────────────

  const ThemeOption = ({ mode, label, icon, description }) => (
    <TouchableOpacity
      style={[st.themeOption, { borderColor: 'transparent' }, themeMode === mode && { borderColor: g.accent, backgroundColor: g.accentSoft }]}
      onPress={() => setThemeMode(mode)}
    >
      <View style={st.themeOptionLeft}>
        <Text style={st.themeIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[st.themeLabel, { color: g.text }]}>{label}</Text>
          <Text style={[st.themeDesc, { color: g.textDim }]}>{description}</Text>
        </View>
      </View>
      {themeMode === mode && (
        <View style={[st.checkCircle, { backgroundColor: g.accent }]}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const SettingRow = ({ icon, title, subtitle, onPress, rightElement, danger }) => (
    <TouchableOpacity style={st.settingRow} onPress={onPress} disabled={!onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={st.settingLeft}>
        <Text style={st.settingIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[st.settingTitle, { color: danger ? g.coral : g.text }]}>{title}</Text>
          {subtitle ? <Text style={[st.settingSubtitle, { color: g.textDim }]}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={st.settingRight}>
        {rightElement}
        {onPress && !rightElement && <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>}
      </View>
    </TouchableOpacity>
  );

  const GoalAdjuster = ({ label, value, field, unit }) => (
    <View style={st.goalRow}>
      <Text style={[st.goalLabel, { color: g.text }]}>{label}</Text>
      <View style={st.goalControls}>
        <TouchableOpacity
          style={[st.goalBtn, { backgroundColor: g.glass, borderColor: g.border }]}
          onPress={() => adjustGoal(field, -1)}
        >
          <Text style={{ color: g.text, fontSize: 18, fontWeight: '700' }}>−</Text>
        </TouchableOpacity>
        <View style={[st.goalValueBox, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}>
          <Text style={{ color: g.accent, fontSize: 16, fontWeight: '900' }}>{value}</Text>
          <Text style={{ color: g.accent, fontSize: 11, fontWeight: '600' }}>{unit}</Text>
        </View>
        <TouchableOpacity
          style={[st.goalBtn, { backgroundColor: g.glass, borderColor: g.border }]}
          onPress={() => adjustGoal(field, 1)}
        >
          <Text style={{ color: g.text, fontSize: 18, fontWeight: '700' }}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <LinearGradient colors={grad.screen} style={st.fill}>
      <ScrollView style={st.scroll} contentContainerStyle={st.inner} showsVerticalScrollIndicator={false}>
        <View style={st.header}>
          <Text style={[st.title, { color: g.text }]}>Settings</Text>
          <Text style={[st.subtitle, { color: g.textMuted }]}>Customize your experience</Text>
        </View>

        {/* Profile card */}
        <LinearGradient colors={grad.card} style={[st.profileCard, { borderColor: g.border }]}>
          <LinearGradient colors={grad.button} style={st.avatarRing}>
            <View style={[st.avatarInner, { backgroundColor: g.bg1 }]}>
              <Text style={[st.avatarText, { color: g.accent }]}>
                {user?.email?.charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[st.profileEmail, { color: g.text }]} numberOfLines={1}>{user?.email || 'Guest User'}</Text>
            <View style={st.profileBadges}>
              <View style={[st.badge, { backgroundColor: g.mintSoft, borderColor: 'rgba(62,232,199,0.3)' }]}>
                <Text style={{ color: g.mint, fontSize: 11, fontWeight: '700' }}>● Active</Text>
              </View>
              {streak > 0 && (
                <View style={[st.badge, { backgroundColor: 'rgba(255,179,71,0.15)', borderColor: 'rgba(255,179,71,0.3)' }]}>
                  <Text style={{ color: '#ffb347', fontSize: 11, fontWeight: '700' }}>🔥 {streak} day streak</Text>
                </View>
              )}
            </View>
          </View>
        </LinearGradient>

        {/* Work Goals */}
        <View style={st.section}>
          <Text style={[st.sectionTitle, { color: g.textMuted }]}>WORK GOALS</Text>
          <LinearGradient colors={grad.card} style={[st.sectionCard, { borderColor: g.border }]}>
            <GoalAdjuster label="Daily Hours Target" value={goals.dailyHoursGoal} field="dailyHoursGoal" unit="hrs" />
            <View style={[st.divider, { backgroundColor: g.border }]} />
            <GoalAdjuster label="Weekly Work Days" value={goals.weeklyDaysGoal} field="weeklyDaysGoal" unit="days" />
          </LinearGradient>
        </View>

        {/* Appearance */}
        <View style={st.section}>
          <Text style={[st.sectionTitle, { color: g.textMuted }]}>APPEARANCE</Text>
          <LinearGradient colors={grad.card} style={[st.sectionCard, { borderColor: g.border }]}>
            <ThemeOption mode="light" label="Light" icon="☀️" description="Always use light mode" />
            <View style={[st.divider, { backgroundColor: g.border }]} />
            <ThemeOption mode="dark" label="Dark" icon="🌙" description="Always use dark mode" />
            <View style={[st.divider, { backgroundColor: g.border }]} />
            <ThemeOption mode="system" label="System" icon="📱" description="Follow system settings" />
          </LinearGradient>
        </View>

        {/* Face Recognition */}
        <View style={st.section}>
          <Text style={[st.sectionTitle, { color: g.textMuted }]}>FACE RECOGNITION</Text>
          <LinearGradient colors={grad.card} style={[st.sectionCard, { borderColor: g.border }]}>
            <SettingRow
              icon="👤"
              title={faceRegistered ? 'Face Registered' : 'Register Your Face'}
              subtitle={faceRegistered ? 'Face recognition is active' : 'Required for check-in/out'}
              onPress={handleRegisterFace}
              rightElement={
                <View style={[st.statusBadge, { backgroundColor: faceRegistered ? g.mintSoft : g.coralSoft, borderColor: faceRegistered ? 'rgba(62,232,199,0.3)' : 'rgba(255,123,156,0.3)' }]}>
                  <Text style={{ color: faceRegistered ? g.mint : g.coral, fontSize: 11, fontWeight: '700' }}>
                    {faceRegistered ? 'Active' : 'Required'}
                  </Text>
                </View>
              }
            />
            {faceRegistered && (
              <>
                <View style={[st.divider, { backgroundColor: g.border }]} />
                <SettingRow icon="🗑️" title="Delete Face Data" subtitle="Remove registered face data" onPress={handleDeleteFace} danger />
              </>
            )}
          </LinearGradient>
        </View>

        {/* Stats & Data */}
        <View style={st.section}>
          <Text style={[st.sectionTitle, { color: g.textMuted }]}>YOUR STATS</Text>
          <LinearGradient colors={grad.card} style={[st.sectionCard, { borderColor: g.border }]}>
            <View style={st.statsGrid}>
              <View style={[st.statBox, { backgroundColor: g.glass }]}>
                <Text style={[st.statValue, { color: g.mint }]}>{totalHours}h</Text>
                <Text style={[st.statLabel, { color: g.textMuted }]}>Total Hours</Text>
              </View>
              <View style={[st.statBox, { backgroundColor: g.glass }]}>
                <Text style={[st.statValue, { color: g.accent }]}>{sessions.length}</Text>
                <Text style={[st.statLabel, { color: g.textMuted }]}>Sessions</Text>
              </View>
              <View style={[st.statBox, { backgroundColor: g.glass }]}>
                <Text style={[st.statValue, { color: streak > 0 ? '#ffb347' : g.textMuted }]}>
                  {streak > 0 ? `🔥${streak}` : '0'}
                </Text>
                <Text style={[st.statLabel, { color: g.textMuted }]}>Streak</Text>
              </View>
              <View style={[st.statBox, { backgroundColor: g.glass }]}>
                <Text style={[st.statValue, { color: g.coral }]}>{avgHours}h</Text>
                <Text style={[st.statLabel, { color: g.textMuted }]}>Avg/Session</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Location Requests */}
        <View style={st.section}>
          <Text style={[st.sectionTitle, { color: g.textMuted }]}>LOCATIONS</Text>
          <LinearGradient colors={grad.card} style={[st.sectionCard, { borderColor: g.border }]}>
            <SettingRow
              icon="📬"
              title="My Location Requests"
              subtitle="View and manage your location submissions"
              onPress={() => navigation.navigate('MyLocationRequests')}
            />
            <View style={[st.divider, { backgroundColor: g.border }]} />
            <SettingRow
              icon="📍"
              title="Request a New Location"
              subtitle="Submit a work location for admin approval"
              onPress={() => navigation.navigate('LocationRequest')}
            />
          </LinearGradient>
        </View>

        {/* Inbox & Activity */}
        <View style={st.section}>
          <Text style={[st.sectionTitle, { color: g.textMuted }]}>INBOX</Text>
          <LinearGradient colors={grad.card} style={[st.sectionCard, { borderColor: g.border }]}>
            <SettingRow
              icon="🔔"
              title="Notifications"
              subtitle="Approvals, alerts and system messages"
              onPress={() => navigation.navigate('Notifications')}
            />
            <View style={[st.divider, { backgroundColor: g.border }]} />
            <SettingRow
              icon="📋"
              title="My Activity"
              subtitle="Timeline of your recent actions"
              onPress={() => navigation.navigate('Activity')}
            />
          </LinearGradient>
        </View>

        {/* Account / admin access */}
        {!isAdmin && (
          <View style={st.section}>
            <Text style={[st.sectionTitle, { color: g.textMuted }]}>ACCOUNT</Text>
            <LinearGradient colors={grad.card} style={[st.sectionCard, { borderColor: g.border }]}>
              <SettingRow
                icon="⚡"
                title="Reload Admin Access"
                subtitle={roleRetryMsg || 'Tap if your admin tab is missing after login'}
                onPress={isRetryingRole ? null : handleRetryRole}
                rightElement={isRetryingRole ? <ActivityIndicator size="small" color={g.accent} /> : null}
              />
            </LinearGradient>
          </View>
        )}

        {/* Data management */}
        <View style={st.section}>
          <Text style={[st.sectionTitle, { color: g.textMuted }]}>DATA MANAGEMENT</Text>
          <LinearGradient colors={grad.card} style={[st.sectionCard, { borderColor: g.border }]}>
            <SettingRow
              icon="🗑️"
              title="Reset All Data"
              subtitle="Clear all time tracking history"
              onPress={handleResetData}
              danger
              rightElement={isResetting ? <ActivityIndicator size="small" color={g.coral} /> : null}
            />
          </LinearGradient>
        </View>

        {/* About */}
        <View style={st.section}>
          <Text style={[st.sectionTitle, { color: g.textMuted }]}>ABOUT</Text>
          <LinearGradient colors={grad.card} style={[st.sectionCard, { borderColor: g.border }]}>
            <SettingRow icon="ℹ️" title="Version" subtitle={appVersion} />
          </LinearGradient>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[st.logoutButton, { backgroundColor: g.coralSoft, borderColor: g.coral }]}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Text style={[st.logoutText, { color: g.coral }]}>🚪  Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 48 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flex: 1 },
  inner: { padding: 20, paddingTop: 56 },
  header: { marginBottom: 22 },
  title: { fontSize: 32, fontWeight: '900' },
  subtitle: { fontSize: 15, marginTop: 4 },

  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20, padding: 16, marginBottom: 24, borderWidth: 1, gap: 14,
  },
  avatarRing: { width: 52, height: 52, borderRadius: 26, padding: 2.5, justifyContent: 'center', alignItems: 'center' },
  avatarInner: { width: '100%', height: '100%', borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 22, fontWeight: '900' },
  profileEmail: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  profileBadges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },

  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '800', marginBottom: 8, marginLeft: 4, letterSpacing: 0.6 },
  sectionCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  divider: { height: 1, marginHorizontal: 14 },

  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  goalLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
  goalControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goalBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  goalValueBox: { minWidth: 56, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, alignItems: 'center' },

  themeOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderWidth: 1, borderColor: 'transparent', margin: 4, borderRadius: 12 },
  themeOptionLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  themeIcon: { fontSize: 20, marginRight: 12 },
  themeLabel: { fontSize: 15, fontWeight: '700' },
  themeDesc: { fontSize: 12, marginTop: 1 },
  checkCircle: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },

  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  settingIcon: { fontSize: 18, marginRight: 12, width: 24, textAlign: 'center' },
  settingTitle: { fontSize: 15, fontWeight: '600' },
  settingSubtitle: { fontSize: 12, marginTop: 2 },
  settingRight: { flexDirection: 'row', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 8 },
  statBox: { width: '46%', borderRadius: 14, padding: 14, alignItems: 'center', flex: 1 },
  statValue: { fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, marginTop: 4, fontWeight: '600' },

  logoutButton: { borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 4, borderWidth: 1 },
  logoutText: { fontSize: 15, fontWeight: '700' },
});
