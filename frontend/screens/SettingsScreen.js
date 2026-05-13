// screens/SettingsScreen.js — Settings with dark mode and app preferences

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Platform, ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import useTimeStore from '../store/timeStore';
import useAuthStore from '../store/authStore';
import { logOut } from '../services/authService';
import { hasFaceData, deleteFaceData } from '../services/faceRecognitionService';

const Icons = {
  theme: '🎨', moon: '🌙', sun: '☀️', device: '📱',
  data: '💾', reset: '🗑️', logout: '🚪', version: 'ℹ️', chevron: '›', check: '✓',
};

export default function SettingsScreen({ navigation }) {
  const { colors: g, gradients: grad, themeMode, setThemeMode } = useThemeStore();
  const { totalTimeSeconds, sessions, resetAll } = useTimeStore();
  const { user } = useAuthStore();

  const [isResetting, setIsResetting] = useState(false);
  const [faceRegistered, setFaceRegistered] = useState(false);
  const [appVersion] = useState('1.0.0');

  useEffect(() => {
    checkFaceStatus();
  }, []);

  const checkFaceStatus = async () => {
    // Supabase user uses .id (not .uid)
    if (user?.id) {
      const hasFace = await hasFaceData(user.id);
      setFaceRegistered(hasFace);
    }
  };

  const handleRegisterFace = () => navigation.navigate('FaceRegistration');

  const handleDeleteFace = () => {
    Alert.alert(
      'Delete Face Data?',
      'This will remove your registered face data. You will need to re-register to use face recognition.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFaceData(user.id);
              setFaceRegistered(false);
              Alert.alert('Success', 'Face data deleted successfully.');
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
        Alert.alert('Success', 'All time tracking data has been reset.');
      } catch {
        Alert.alert('Error', 'Failed to reset data. Please try again.');
      } finally {
        setIsResetting(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Reset all data?\n\nThis will clear all your accumulated time and session history. This action cannot be undone.')) {
        confirmReset();
      }
    } else {
      Alert.alert(
        'Reset All Data?',
        'This will clear all your accumulated time and session history. This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset', style: 'destructive', onPress: confirmReset },
        ]
      );
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

  const ThemeOption = ({ mode, label, icon, description }) => (
    <TouchableOpacity
      style={[styles.themeOption, { borderColor: g.border }, themeMode === mode && { borderColor: g.accent, backgroundColor: g.accentSoft }]}
      onPress={() => setThemeMode(mode)}
    >
      <View style={styles.themeOptionLeft}>
        <Text style={styles.themeIcon}>{icon}</Text>
        <View style={styles.themeTextContainer}>
          <Text style={[styles.themeLabel, { color: g.text }]}>{label}</Text>
          <Text style={[styles.themeDescription, { color: g.textDim }]}>{description}</Text>
        </View>
      </View>
      {themeMode === mode && <Text style={[styles.checkmark, { color: g.accent }]}>{Icons.check}</Text>}
    </TouchableOpacity>
  );

  const SettingItem = ({ icon, title, subtitle, onPress, rightElement, danger }) => (
    <TouchableOpacity style={[styles.settingItem, { borderColor: g.border }]} onPress={onPress} disabled={!onPress}>
      <View style={styles.settingLeft}>
        <Text style={styles.settingIcon}>{icon}</Text>
        <View style={styles.settingTextContainer}>
          <Text style={[styles.settingTitle, { color: danger ? g.coral : g.text }]}>{title}</Text>
          {subtitle && <Text style={[styles.settingSubtitle, { color: g.textDim }]}>{subtitle}</Text>}
        </View>
      </View>
      <View style={styles.settingRight}>
        {rightElement}
        {onPress && !rightElement && <Text style={[styles.chevron, { color: g.textDim }]}>{Icons.chevron}</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={grad.screen} style={styles.fill}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.inner}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: g.text }]}>Settings</Text>
          <Text style={[styles.subtitle, { color: g.textMuted }]}>Customize your experience</Text>
        </View>

        <LinearGradient colors={grad.card} style={[styles.userCard, { borderColor: g.border }]}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>{user?.email?.charAt(0).toUpperCase() || '?'}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={[styles.userEmail, { color: g.text }]} numberOfLines={1}>{user?.email || 'Guest User'}</Text>
            <Text style={[styles.userStatus, { color: g.mint }]}>● Active</Text>
          </View>
        </LinearGradient>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: g.textMuted }]}>APPEARANCE</Text>
          <LinearGradient colors={grad.card} style={[styles.sectionCard, { borderColor: g.border }]}>
            <ThemeOption mode="light" label="Light" icon={Icons.sun} description="Always use light mode" />
            <View style={[styles.divider, { backgroundColor: g.border }]} />
            <ThemeOption mode="dark" label="Dark" icon={Icons.moon} description="Always use dark mode" />
            <View style={[styles.divider, { backgroundColor: g.border }]} />
            <ThemeOption mode="system" label="System" icon={Icons.device} description="Follow system settings" />
          </LinearGradient>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: g.textMuted }]}>FACE RECOGNITION</Text>
          <LinearGradient colors={grad.card} style={[styles.sectionCard, { borderColor: g.border }]}>
            <SettingItem
              icon="👤"
              title={faceRegistered ? 'Face Registered' : 'Register Your Face'}
              subtitle={faceRegistered ? 'Face recognition is active' : 'Required for check-in/out'}
              onPress={handleRegisterFace}
              rightElement={
                <View style={[styles.statusBadge, { backgroundColor: faceRegistered ? g.mintSoft : g.coralSoft }]}>
                  <Text style={{ color: faceRegistered ? g.mint : g.coral, fontSize: 11, fontWeight: '700' }}>
                    {faceRegistered ? 'Active' : 'Required'}
                  </Text>
                </View>
              }
            />
            {faceRegistered && (
              <>
                <View style={[styles.divider, { backgroundColor: g.border }]} />
                <SettingItem icon="🗑️" title="Delete Face Data" subtitle="Remove registered face data" onPress={handleDeleteFace} danger />
              </>
            )}
          </LinearGradient>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: g.textMuted }]}>DATA & STORAGE</Text>
          <LinearGradient colors={grad.card} style={[styles.sectionCard, { borderColor: g.border }]}>
            <SettingItem
              icon={Icons.data}
              title="Total Time Tracked"
              subtitle={`${Math.floor(totalTimeSeconds / 3600)} hours across ${sessions.length} sessions`}
            />
            <View style={[styles.divider, { backgroundColor: g.border }]} />
            <SettingItem
              icon={Icons.reset}
              title="Reset All Data"
              subtitle="Clear all time tracking history"
              onPress={handleResetData}
              danger
              rightElement={isResetting ? <ActivityIndicator size="small" color={g.coral} /> : null}
            />
          </LinearGradient>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: g.textMuted }]}>ABOUT</Text>
          <LinearGradient colors={grad.card} style={[styles.sectionCard, { borderColor: g.border }]}>
            <SettingItem icon={Icons.version} title="Version" subtitle={appVersion} />
          </LinearGradient>
        </View>

        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: g.coralSoft, borderColor: g.coral }]}
          onPress={handleLogout}
        >
          <Text style={[styles.logoutText, { color: g.coral }]}>{Icons.logout} Sign Out</Text>
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flex: 1 },
  inner: { padding: 24, paddingTop: 56 },
  header: { marginBottom: 24 },
  title: { fontSize: 32, fontWeight: '900' },
  subtitle: { fontSize: 15, marginTop: 4 },
  userCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 16, marginBottom: 24, borderWidth: 1 },
  userAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(139,124,255,0.3)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  userAvatarText: { fontSize: 22, fontWeight: '800', color: '#8b7cff' },
  userInfo: { flex: 1 },
  userEmail: { fontSize: 16, fontWeight: '700' },
  userStatus: { fontSize: 13, marginTop: 2, fontWeight: '600' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '800', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 },
  sectionCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  themeOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderWidth: 1, borderColor: 'transparent', margin: 4, borderRadius: 12 },
  themeOptionLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  themeIcon: { fontSize: 20, marginRight: 12 },
  themeTextContainer: { flex: 1 },
  themeLabel: { fontSize: 15, fontWeight: '700' },
  themeDescription: { fontSize: 12, marginTop: 2 },
  checkmark: { fontSize: 16, fontWeight: '700' },
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderWidth: 1, borderColor: 'transparent' },
  settingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  settingIcon: { fontSize: 18, marginRight: 12, width: 24, textAlign: 'center' },
  settingTextContainer: { flex: 1 },
  settingTitle: { fontSize: 15, fontWeight: '600' },
  settingSubtitle: { fontSize: 12, marginTop: 2 },
  settingRight: { flexDirection: 'row', alignItems: 'center' },
  chevron: { fontSize: 20, marginLeft: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  divider: { height: 1, marginHorizontal: 14 },
  logoutButton: { borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8, borderWidth: 1 },
  logoutText: { fontSize: 15, fontWeight: '700' },
  bottomPadding: { height: 40 },
});
