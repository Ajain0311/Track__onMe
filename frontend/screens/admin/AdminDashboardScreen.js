// screens/admin/AdminDashboardScreen.js

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../../store/themeStore';
import useAuthStore from '../../store/authStore';
import { adminGetStats, adminGetLocationRequests, adminGetLeaves, adminGetCorrections, getApiErrorMessage } from '../../services/api';

const StatCard = ({ label, value, color, icon, g, grad, anim }) => (
  <Animated.View style={[
    { flex: 1, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
  ]}>
    <LinearGradient colors={grad.card} style={[st.statCard, { borderColor: g.border }]}>
      <Text style={{ fontSize: 26 }}>{icon}</Text>
      <Text style={[st.statValue, { color }]}>{value}</Text>
      <Text style={[st.statLabel, { color: g.textMuted }]}>{label}</Text>
    </LinearGradient>
  </Animated.View>
);

export default function AdminDashboardScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const { user } = useAuthStore();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [pendingLeaves, setPendingLeaves]       = useState(0);
  const [pendingCorrections, setPendingCorrections] = useState(0);
  const anims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [statsRes, reqRes, leavesRes, correctionsRes] = await Promise.allSettled([
        adminGetStats(),
        adminGetLocationRequests('pending'),
        adminGetLeaves({ status: 'pending' }),
        adminGetCorrections({ status: 'pending' }),
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      else setError(getApiErrorMessage(statsRes.reason));
      if (reqRes.status === 'fulfilled') {
        setPendingRequests(reqRes.value.data.pendingCount || reqRes.value.data.requests?.length || 0);
      }
      if (leavesRes.status === 'fulfilled') {
        setPendingLeaves(leavesRes.value.data.pendingCount || leavesRes.value.data.leaves?.length || 0);
      }
      if (correctionsRes.status === 'fulfilled') {
        setPendingCorrections(correctionsRes.value.data.pendingCount || correctionsRes.value.data.corrections?.length || 0);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!loading && stats) {
      Animated.stagger(80, anims.map((a) =>
        Animated.spring(a, { toValue: 1, tension: 55, friction: 7, useNativeDriver: true })
      )).start();
    }
  }, [loading, stats]);

  const statItems = stats ? [
    { label: 'Total Users', value: stats.totalUsers, color: g.accent, icon: '👥' },
    { label: 'Active Now', value: stats.activeNow, color: g.mint, icon: '🟢' },
    { label: 'Today\'s Check-ins', value: stats.checkedInToday, color: g.text, icon: '📅' },
    { label: 'Active Locations', value: stats.activeLocations, color: '#ffb347', icon: '📍' },
  ] : [];

  return (
    <LinearGradient colors={grad.screen} style={st.fill}>
      <ScrollView
        contentContainerStyle={st.inner}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={g.accent} />}
      >
        {/* Header */}
        <View style={st.header}>
          <View style={[st.adminBadge, { backgroundColor: 'rgba(255,179,71,0.18)', borderColor: 'rgba(255,179,71,0.4)' }]}>
            <Text style={{ color: '#ffb347', fontSize: 11, fontWeight: '800' }}>⚡ ADMIN</Text>
          </View>
          <Text style={[st.title, { color: g.text }]}>Admin Panel</Text>
          <Text style={[st.subtitle, { color: g.textMuted }]}>{user?.email}</Text>
        </View>

        {error && (
          <View style={[st.errorBox, { backgroundColor: g.errorBg, borderColor: g.errorBorder }]}>
            <Text style={{ color: g.coral, fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {loading ? (
          <View style={st.centered}>
            <ActivityIndicator size="large" color={g.accent} />
          </View>
        ) : (
          <>
            {/* Stat grid */}
            <View style={st.statRow}>
              {statItems.slice(0, 2).map((s, i) => (
                <StatCard key={s.label} {...s} g={g} grad={grad} anim={anims[i]} />
              ))}
            </View>
            <View style={st.statRow}>
              {statItems.slice(2, 4).map((s, i) => (
                <StatCard key={s.label} {...s} g={g} grad={grad} anim={anims[i + 2]} />
              ))}
            </View>

            {/* Quick actions */}
            <Text style={[st.sectionTitle, { color: g.textMuted }]}>QUICK ACTIONS</Text>
            <View style={st.actionGrid}>
              <TouchableOpacity
                style={[st.actionCard, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}
                onPress={() => navigation.navigate('AdminUsers')}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 30, marginBottom: 8 }}>👥</Text>
                <Text style={[st.actionLabel, { color: g.accent }]}>Manage Users</Text>
                <Text style={[st.actionSub, { color: g.textMuted }]}>View attendance & roles</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[st.actionCard, { backgroundColor: 'rgba(255,179,71,0.12)', borderColor: 'rgba(255,179,71,0.35)' }]}
                onPress={() => navigation.navigate('AdminLocations')}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 30, marginBottom: 8 }}>📍</Text>
                <Text style={[st.actionLabel, { color: '#ffb347' }]}>Manage Locations</Text>
                <Text style={[st.actionSub, { color: g.textMuted }]}>Add, edit, toggle offices</Text>
              </TouchableOpacity>
            </View>

            {/* Location Requests action */}
            <TouchableOpacity
              style={[st.requestsCard, {
                backgroundColor: pendingRequests > 0 ? 'rgba(255,179,71,0.08)' : g.glass,
                borderColor: pendingRequests > 0 ? 'rgba(255,179,71,0.45)' : g.border,
              }]}
              onPress={() => navigation.navigate('AdminLocationRequests')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>📬</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Location Requests</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Review user location submissions</Text>
                </View>
                {pendingRequests > 0 && (
                  <View style={[st.pendingBadge, { backgroundColor: '#ffb347' }]}>
                    <Text style={{ color: '#000', fontSize: 12, fontWeight: '900' }}>{pendingRequests}</Text>
                  </View>
                )}
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Live Attendance action */}
            <TouchableOpacity
              style={[st.requestsCard, {
                backgroundColor: (stats?.activeNow || 0) > 0 ? 'rgba(62,232,199,0.08)' : g.glass,
                borderColor:     (stats?.activeNow || 0) > 0 ? 'rgba(62,232,199,0.45)' : g.border,
              }]}
              onPress={() => navigation.navigate('AdminLiveAttendance')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>🟢</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Live Attendance</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Who is currently checked in</Text>
                </View>
                {(stats?.activeNow || 0) > 0 && (
                  <View style={[st.pendingBadge, { backgroundColor: g.mint || '#3ee8c7' }]}>
                    <Text style={{ color: '#000', fontSize: 12, fontWeight: '900' }}>{stats.activeNow}</Text>
                  </View>
                )}
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Leave Requests action */}
            <TouchableOpacity
              style={[st.requestsCard, {
                backgroundColor: pendingLeaves > 0 ? 'rgba(139,124,255,0.08)' : g.glass,
                borderColor: pendingLeaves > 0 ? 'rgba(139,124,255,0.45)' : g.border,
              }]}
              onPress={() => navigation.navigate('AdminLeaves')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>🌴</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Leave Requests</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Approve or reject employee leaves</Text>
                </View>
                {pendingLeaves > 0 && (
                  <View style={[st.pendingBadge, { backgroundColor: g.accent }]}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>{pendingLeaves}</Text>
                  </View>
                )}
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Correction Requests action */}
            <TouchableOpacity
              style={[st.requestsCard, {
                backgroundColor: pendingCorrections > 0 ? 'rgba(62,232,199,0.08)' : g.glass,
                borderColor: pendingCorrections > 0 ? 'rgba(62,232,199,0.45)' : g.border,
              }]}
              onPress={() => navigation.navigate('AdminCorrections')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>✏️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Correction Requests</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Review attendance time corrections</Text>
                </View>
                {pendingCorrections > 0 && (
                  <View style={[st.pendingBadge, { backgroundColor: g.mint }]}>
                    <Text style={{ color: '#000', fontSize: 12, fontWeight: '900' }}>{pendingCorrections}</Text>
                  </View>
                )}
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Anomaly Detection */}
            <TouchableOpacity
              style={[st.requestsCard, { backgroundColor: 'rgba(229,83,75,0.06)', borderColor: 'rgba(229,83,75,0.3)' }]}
              onPress={() => navigation.navigate('AdminAnomalies')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>🔍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Anomaly Detection</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Unusual check-in patterns & timing</Text>
                </View>
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Absenteeism Report */}
            <TouchableOpacity
              style={[st.requestsCard, { backgroundColor: 'rgba(229,83,75,0.08)', borderColor: 'rgba(229,83,75,0.35)' }]}
              onPress={() => navigation.navigate('AdminAbsenteeism')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Absenteeism Report</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Identify chronic absentees by dept</Text>
                </View>
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Leave Analytics */}
            <TouchableOpacity
              style={[st.requestsCard, { backgroundColor: 'rgba(62,232,199,0.08)', borderColor: 'rgba(62,232,199,0.35)' }]}
              onPress={() => navigation.navigate('AdminLeaveAnalytics')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>🌴</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Leave Analytics</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Trends, type & dept breakdown</Text>
                </View>
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Workforce Analytics */}
            <TouchableOpacity
              style={[st.requestsCard, { backgroundColor: 'rgba(62,232,199,0.08)', borderColor: 'rgba(62,232,199,0.35)' }]}
              onPress={() => navigation.navigate('AdminAnalytics')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>📈</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Workforce Analytics</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Trends, dept breakdown, top performers</Text>
                </View>
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Reports action */}
            <TouchableOpacity
              style={[st.requestsCard, { backgroundColor: 'rgba(139,124,255,0.08)', borderColor: 'rgba(139,124,255,0.35)' }]}
              onPress={() => navigation.navigate('AdminReports')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>📊</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Reports & Export</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Attendance & leave reports, CSV export</Text>
                </View>
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Holiday Calendar */}
            <TouchableOpacity
              style={[st.requestsCard, { backgroundColor: 'rgba(255,179,71,0.08)', borderColor: 'rgba(255,179,71,0.35)' }]}
              onPress={() => navigation.navigate('AdminHolidays')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>🎉</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Holiday Calendar</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Manage public & company holidays</Text>
                </View>
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Departments action */}
            <TouchableOpacity
              style={[st.requestsCard, { backgroundColor: 'rgba(79,172,254,0.08)', borderColor: 'rgba(79,172,254,0.35)' }]}
              onPress={() => navigation.navigate('AdminDepartments')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>🏢</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Departments</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Manage department structure</Text>
                </View>
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Designations */}
            <TouchableOpacity
              style={[st.requestsCard, { backgroundColor: 'rgba(79,172,254,0.08)', borderColor: 'rgba(79,172,254,0.35)' }]}
              onPress={() => navigation.navigate('AdminDesignations')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>🏷️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Designations</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Manage job titles & role levels</Text>
                </View>
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Shift Management */}
            <TouchableOpacity
              style={[st.requestsCard, { backgroundColor: 'rgba(62,232,199,0.08)', borderColor: 'rgba(62,232,199,0.35)' }]}
              onPress={() => navigation.navigate('AdminShifts')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>🕐</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Shift Management</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Define shifts & assign employees</Text>
                </View>
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Org Settings */}
            <TouchableOpacity
              style={[st.requestsCard, { backgroundColor: 'rgba(255,179,71,0.08)', borderColor: 'rgba(255,179,71,0.35)' }]}
              onPress={() => navigation.navigate('AdminOrgSettings')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>⚙️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Organization Settings</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Work hours, late threshold, working days</Text>
                </View>
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Audit Logs action */}
            <TouchableOpacity
              style={[st.requestsCard, { backgroundColor: g.glass, borderColor: g.border }]}
              onPress={() => navigation.navigate('AdminAuditLogs')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>📜</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.actionLabel, { color: g.text }]}>Audit Logs</Text>
                  <Text style={[st.actionSub, { color: g.textMuted }]}>Sensitive admin action trail</Text>
                </View>
                <Text style={{ color: g.textDim, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>

            {/* Info card */}
            <LinearGradient colors={grad.card} style={[st.infoCard, { borderColor: g.border }]}>
              <Text style={[st.infoTitle, { color: g.text }]}>About Admin Mode</Text>
              <Text style={[st.infoBody, { color: g.textMuted }]}>
                • Add locations with GPS coordinates and allowed WiFi names{'\n'}
                • Users must be at an approved location to check in{'\n'}
                • View and export any user's attendance history{'\n'}
                • Promote/demote users between admin and regular roles
              </Text>
            </LinearGradient>
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  inner: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  header: { marginBottom: 24 },
  adminBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  title: { fontSize: 32, fontWeight: '900' },
  subtitle: { fontSize: 14, marginTop: 4 },
  errorBox: { borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
  centered: { height: 150, justifyContent: 'center', alignItems: 'center' },
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: { borderRadius: 18, padding: 16, borderWidth: 1, alignItems: 'center', flex: 1 },
  statValue: { fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 6 },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 20, marginBottom: 10, marginLeft: 4 },
  actionGrid: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  actionCard: { flex: 1, borderRadius: 18, padding: 18, borderWidth: 1 },
  actionLabel: { fontSize: 14, fontWeight: '800' },
  actionSub: { fontSize: 12, marginTop: 4 },
  infoCard: { borderRadius: 18, padding: 18, borderWidth: 1 },
  infoTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  infoBody: { fontSize: 13, lineHeight: 22 },
  requestsCard: { borderRadius: 18, padding: 16, borderWidth: 1, marginBottom: 20 },
  pendingBadge: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
