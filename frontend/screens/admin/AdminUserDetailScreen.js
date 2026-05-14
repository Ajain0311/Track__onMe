// screens/admin/AdminUserDetailScreen.js

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../../store/themeStore';
import { adminGetUserAttendance, getApiErrorMessage } from '../../services/api';

const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};
const fmtDuration = (min) => {
  if (min == null) return 'In progress';
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// Group records by date
const groupByDate = (records) => {
  const map = new Map();
  for (const r of records) {
    const day = r.date || r.checkInTime?.split('T')[0];
    if (!day) continue;
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(r);
  }
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
};

export default function AdminUserDetailScreen({ route, navigation }) {
  const { userId, email } = route.params;
  const { colors: g, gradients: grad } = useThemeStore();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminGetUserAttendance(userId);
      setRecords(res.data.records || []);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const totalMinutes = records.reduce((sum, r) => sum + (r.totalDuration || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const days = new Set(records.map((r) => r.date)).size;
  const grouped = groupByDate(records);

  const renderDay = ([date, dayRecords]) => (
    <View key={date} style={st.dayGroup}>
      <Text style={[st.dayHeader, { color: g.textMuted }]}>{fmtDate(date)}</Text>
      {dayRecords.map((r) => (
        <LinearGradient key={r.id} colors={grad.card} style={[st.sessionRow, { borderColor: g.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[st.sessionTime, { color: g.text }]}>
              {fmtTime(r.checkInTime)} → {r.checkOutTime ? fmtTime(r.checkOutTime) : 'Active'}
            </Text>
            {r.locationName && (
              <Text style={[st.sessionLocation, { color: g.accent }]}>📍 {r.locationName}</Text>
            )}
            {r.checkInMethod && (
              <Text style={[st.sessionMeta, { color: g.textDim }]}>via {r.checkInMethod}</Text>
            )}
          </View>
          <View style={[st.durBadge, { backgroundColor: r.checkOutTime ? g.mintSoft : 'rgba(255,179,71,0.15)' }]}>
            <Text style={{ color: r.checkOutTime ? g.mint : '#ffb347', fontSize: 13, fontWeight: '800' }}>
              {fmtDuration(r.totalDuration)}
            </Text>
          </View>
        </LinearGradient>
      ))}
    </View>
  );

  return (
    <LinearGradient colors={grad.screen} style={st.fill}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Text style={{ color: g.accent, fontSize: 16 }}>‹ Back</Text>
        </TouchableOpacity>
        <View style={[st.avatarCircle, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}>
          <Text style={{ color: g.accent, fontSize: 22, fontWeight: '900' }}>
            {email?.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={[st.email, { color: g.text }]} numberOfLines={1}>{email}</Text>

        {/* Summary chips */}
        {!loading && (
          <View style={st.summaryRow}>
            <View style={[st.chip, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}>
              <Text style={{ color: g.accent, fontSize: 13, fontWeight: '800' }}>{totalHours}h</Text>
              <Text style={{ color: g.textMuted, fontSize: 10, marginTop: 2 }}>Total</Text>
            </View>
            <View style={[st.chip, { backgroundColor: g.mintSoft, borderColor: 'rgba(62,232,199,0.3)' }]}>
              <Text style={{ color: g.mint, fontSize: 13, fontWeight: '800' }}>{days}</Text>
              <Text style={{ color: g.textMuted, fontSize: 10, marginTop: 2 }}>Days</Text>
            </View>
            <View style={[st.chip, { backgroundColor: g.glass, borderColor: g.border }]}>
              <Text style={{ color: g.text, fontSize: 13, fontWeight: '800' }}>{records.length}</Text>
              <Text style={{ color: g.textMuted, fontSize: 10, marginTop: 2 }}>Sessions</Text>
            </View>
          </View>
        )}
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
        <FlatList
          data={grouped}
          keyExtractor={([date]) => date}
          renderItem={({ item }) => renderDay(item)}
          contentContainerStyle={st.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={g.accent} />}
          ListEmptyComponent={
            <View style={st.empty}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
              <Text style={{ color: g.textMuted, fontSize: 16 }}>No attendance records</Text>
            </View>
          }
        />
      )}
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, alignItems: 'flex-start' },
  backBtn: { marginBottom: 16 },
  avatarCircle: { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center', borderWidth: 2, marginBottom: 10 },
  email: { fontSize: 16, fontWeight: '700', maxWidth: '100%' },
  summaryRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  chip: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', borderWidth: 1 },
  errorBox: { borderRadius: 12, padding: 12, borderWidth: 1, marginHorizontal: 20, marginBottom: 10 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 20, paddingBottom: 40 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  dayGroup: { marginBottom: 20 },
  dayHeader: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  sessionRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 6, borderWidth: 1 },
  sessionTime: { fontSize: 14, fontWeight: '700' },
  sessionLocation: { fontSize: 12, marginTop: 3 },
  sessionMeta: { fontSize: 11, marginTop: 2 },
  durBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, alignItems: 'center' },
});
