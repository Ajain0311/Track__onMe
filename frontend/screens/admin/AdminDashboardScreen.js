// screens/admin/AdminDashboardScreen.js — Grouped admin panel with search

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Animated, TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../../store/themeStore';
import useAuthStore from '../../store/authStore';
import { adminGetStats, adminGetLocationRequests, adminGetLeaves, adminGetCorrections, getApiErrorMessage } from '../../services/api';

// ── All navigation items ──────────────────────────────────────────────────────
const ALL_ITEMS = [
  // Operations
  { key: 'live',        section: 'operations', emoji: '🟢', title: 'Live Attendance',      sub: 'Who is currently checked in',       screen: 'AdminLiveAttendance',  badge: 'activeNow' },
  { key: 'leaves',      section: 'operations', emoji: '🌴', title: 'Leave Requests',        sub: 'Approve or reject employee leaves',  screen: 'AdminLeaves',          badge: 'pendingLeaves' },
  { key: 'corrections', section: 'operations', emoji: '✏️', title: 'Correction Requests',   sub: 'Review attendance time corrections', screen: 'AdminCorrections',      badge: 'pendingCorrections' },
  { key: 'locreqs',     section: 'operations', emoji: '📬', title: 'Location Requests',     sub: 'Review user location submissions',  screen: 'AdminLocationRequests', badge: 'pendingRequests' },
  // Analytics
  { key: 'analytics',   section: 'analytics',  emoji: '📈', title: 'Workforce Analytics',   sub: 'Trends, dept breakdown, performers', screen: 'AdminAnalytics' },
  { key: 'leaveana',    section: 'analytics',  emoji: '🌿', title: 'Leave Analytics',        sub: 'Monthly trends & type breakdown',   screen: 'AdminLeaveAnalytics' },
  { key: 'absenteeism', section: 'analytics',  emoji: '⚠️', title: 'Absenteeism Report',     sub: 'Chronic absentees by department',   screen: 'AdminAbsenteeism' },
  { key: 'anomalies',   section: 'analytics',  emoji: '🔍', title: 'Anomaly Detection',      sub: 'Unusual check-in patterns',         screen: 'AdminAnomalies' },
  { key: 'reports',     section: 'analytics',  emoji: '📊', title: 'Reports & Export',       sub: 'Attendance & leave CSV exports',    screen: 'AdminReports' },
  { key: 'auditlogs',   section: 'analytics',  emoji: '📜', title: 'Audit Logs',             sub: 'Admin action trail',                screen: 'AdminAuditLogs' },
  // People
  { key: 'users',       section: 'people',     emoji: '👥', title: 'Manage Users',           sub: 'View attendance & assign roles',    screen: 'AdminUsers' },
  { key: 'departments', section: 'people',     emoji: '🏢', title: 'Departments',            sub: 'Manage department structure',       screen: 'AdminDepartments' },
  { key: 'designations',section: 'people',     emoji: '🏷️', title: 'Designations',           sub: 'Job titles & role levels',          screen: 'AdminDesignations' },
  { key: 'shifts',      section: 'people',     emoji: '🕐', title: 'Shift Management',       sub: 'Define shifts & assign employees',  screen: 'AdminShifts' },
  // Configuration
  { key: 'locations',   section: 'config',     emoji: '📍', title: 'Manage Locations',       sub: 'Add, edit, toggle office locations',screen: 'AdminLocations' },
  { key: 'holidays',    section: 'config',     emoji: '🎉', title: 'Holiday Calendar',       sub: 'Public & company holidays',         screen: 'AdminHolidays' },
  { key: 'orgsettings', section: 'config',     emoji: '⚙️', title: 'Organization Settings',  sub: 'Work hours, late threshold, days',  screen: 'AdminOrgSettings' },
];

const SECTIONS = [
  { key: 'operations', label: 'OPERATIONS',     accent: '#3ee8c7' },
  { key: 'analytics',  label: 'ANALYTICS',      accent: '#8b7cff' },
  { key: 'people',     label: 'PEOPLE',         accent: '#4facfe' },
  { key: 'config',     label: 'CONFIGURATION',  accent: '#ffb347' },
];

const StatCard = ({ label, value, color, icon, g, grad, anim }) => (
  <Animated.View style={[
    { flex: 1, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
  ]}>
    <LinearGradient colors={grad.card} style={[st.statCard, { borderColor: g.border }]}>
      <Text style={{ fontSize: 26 }}>{icon}</Text>
      <Text style={[st.statValue, { color }]}>{value ?? '—'}</Text>
      <Text style={[st.statLabel, { color: g.textMuted }]}>{label}</Text>
    </LinearGradient>
  </Animated.View>
);

export default function AdminDashboardScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const { user } = useAuthStore();

  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState('');

  const [pendingRequests, setPendingRequests]     = useState(0);
  const [pendingLeaves, setPendingLeaves]         = useState(0);
  const [pendingCorrections, setPendingCorrections] = useState(0);

  const anims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [statsRes, reqRes, leavesRes, corrsRes] = await Promise.allSettled([
        adminGetStats(),
        adminGetLocationRequests('pending'),
        adminGetLeaves({ status: 'pending' }),
        adminGetCorrections({ status: 'pending' }),
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      else setError(getApiErrorMessage(statsRes.reason));
      if (reqRes.status === 'fulfilled')
        setPendingRequests(reqRes.value.data.pendingCount || reqRes.value.data.requests?.length || 0);
      if (leavesRes.status === 'fulfilled')
        setPendingLeaves(leavesRes.value.data.pendingCount || leavesRes.value.data.leaves?.length || 0);
      if (corrsRes.status === 'fulfilled')
        setPendingCorrections(corrsRes.value.data.pendingCount || corrsRes.value.data.corrections?.length || 0);
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

  const badgeValues = {
    activeNow:         stats?.activeNow || 0,
    pendingLeaves,
    pendingCorrections,
    pendingRequests,
  };

  const statItems = stats ? [
    { label: 'Total Users',     value: stats.totalUsers,    color: g.accent,   icon: '👥' },
    { label: 'Active Now',      value: stats.activeNow,     color: g.mint,     icon: '🟢' },
    { label: "Today's Check-ins", value: stats.checkedInToday, color: g.text,  icon: '📅' },
    { label: 'Locations',       value: stats.activeLocations, color: '#ffb347', icon: '📍' },
  ] : [];

  // Search filter
  const q = search.trim().toLowerCase();
  const filteredItems = useMemo(() =>
    q ? ALL_ITEMS.filter((item) =>
      item.title.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q)
    ) : null,
    [q]
  );

  const renderItem = (item) => {
    const badge = item.badge ? badgeValues[item.badge] : 0;
    const hasBadge = badge > 0;
    return (
      <TouchableOpacity
        key={item.key}
        style={[st.itemRow, { borderColor: hasBadge ? 'rgba(139,124,255,0.45)' : g.border,
          backgroundColor: hasBadge ? 'rgba(139,124,255,0.06)' : g.glass }]}
        onPress={() => navigation.navigate(item.screen)}
        activeOpacity={0.78}
      >
        <Text style={st.itemEmoji}>{item.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[st.itemTitle, { color: g.text }]}>{item.title}</Text>
          <Text style={[st.itemSub, { color: g.textMuted }]}>{item.sub}</Text>
        </View>
        {hasBadge && (
          <View style={[st.badge, { backgroundColor: badge === badgeValues.activeNow ? g.mint : g.accent }]}>
            <Text style={{ color: badge === badgeValues.activeNow ? '#000' : '#fff', fontSize: 11, fontWeight: '900' }}>{badge}</Text>
          </View>
        )}
        <Text style={{ color: g.textDim, fontSize: 18, marginLeft: 4 }}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={grad.screen} style={st.fill}>
      <ScrollView
        contentContainerStyle={st.inner}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
          <View style={st.centered}><ActivityIndicator size="large" color={g.accent} /></View>
        ) : (
          <>
            {/* Stat grid */}
            <View style={st.statRow}>
              {statItems.slice(0, 2).map((s, i) => <StatCard key={s.label} {...s} g={g} grad={grad} anim={anims[i]} />)}
            </View>
            <View style={st.statRow}>
              {statItems.slice(2, 4).map((s, i) => <StatCard key={s.label} {...s} g={g} grad={grad} anim={anims[i + 2]} />)}
            </View>

            {/* Search bar */}
            <View style={[st.searchWrap, { backgroundColor: g.glass, borderColor: g.border }]}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>🔎</Text>
              <TextInput
                style={[st.searchInput, { color: g.text }]}
                placeholder="Search admin features…"
                placeholderTextColor={g.textDim}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Text style={{ color: g.textMuted, fontSize: 16, paddingLeft: 8 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Search results */}
            {filteredItems ? (
              filteredItems.length === 0 ? (
                <View style={st.noResults}>
                  <Text style={[st.noResultsText, { color: g.textMuted }]}>No features match "{search}"</Text>
                </View>
              ) : (
                <View style={st.sectionBlock}>
                  {filteredItems.map(renderItem)}
                </View>
              )
            ) : (
              /* Grouped sections */
              SECTIONS.map((section) => {
                const sectionItems = ALL_ITEMS.filter((i) => i.section === section.key);
                return (
                  <View key={section.key} style={st.sectionWrap}>
                    <View style={st.sectionHeader}>
                      <View style={[st.sectionLine, { backgroundColor: section.accent }]} />
                      <Text style={[st.sectionLabel, { color: section.accent }]}>{section.label}</Text>
                    </View>
                    <View style={st.sectionBlock}>
                      {sectionItems.map(renderItem)}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  fill:        { flex: 1 },
  inner:       { padding: 20, paddingTop: 56, paddingBottom: 40 },
  header:      { marginBottom: 20 },
  adminBadge:  { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  title:       { fontSize: 32, fontWeight: '900' },
  subtitle:    { fontSize: 14, marginTop: 4 },
  errorBox:    { borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
  centered:    { height: 150, justifyContent: 'center', alignItems: 'center' },

  statRow:     { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard:    { borderRadius: 18, padding: 16, borderWidth: 1, alignItems: 'center', flex: 1 },
  statValue:   { fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 6 },
  statLabel:   { fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' },

  searchWrap:  { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginTop: 14, marginBottom: 20 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },

  noResults:     { alignItems: 'center', paddingVertical: 30 },
  noResultsText: { fontSize: 14 },

  sectionWrap:   { marginBottom: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionLine:   { width: 3, height: 14, borderRadius: 2 },
  sectionLabel:  { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  sectionBlock:  { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },

  itemRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  itemEmoji: { fontSize: 22, width: 30, textAlign: 'center' },
  itemTitle: { fontSize: 14, fontWeight: '800' },
  itemSub:   { fontSize: 12, marginTop: 1 },
  badge:     { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },

  // Legacy (unused but kept for safety)
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginTop: 20, marginBottom: 10 },
  actionGrid:   { flexDirection: 'row', gap: 10, marginBottom: 20 },
  actionCard:   { flex: 1, borderRadius: 18, padding: 18, borderWidth: 1 },
  actionLabel:  { fontSize: 14, fontWeight: '800' },
  actionSub:    { fontSize: 12, marginTop: 4 },
  requestsCard: { borderRadius: 18, padding: 16, borderWidth: 1, marginBottom: 12 },
  pendingBadge: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  infoCard:     { borderRadius: 18, padding: 18, borderWidth: 1 },
  infoTitle:    { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  infoBody:     { fontSize: 13, lineHeight: 22 },
});
