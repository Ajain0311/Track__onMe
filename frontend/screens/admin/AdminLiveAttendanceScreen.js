// screens/admin/AdminLiveAttendanceScreen.js
// Real-ish-time view of users who are currently checked in.
// Polls every 15s and shows elapsed session time per user.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../../store/themeStore';
import { adminGetActiveSessions, getApiErrorMessage } from '../../services/api';
import ScreenHeader from '../../components/ScreenHeader';
import EmptyState from '../../components/EmptyState';
import LoadingState from '../../components/LoadingState';
import AdminGuard from '../../components/AdminGuard';
import { useToast } from '../../components/ToastProvider';

const fmtElapsed = (mins) => {
  const m = Math.max(0, mins | 0);
  const h = Math.floor(m / 60), r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
};

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

export default function AdminLiveAttendanceScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    try {
      const res = await adminGetActiveSessions();
      setSessions(res.data?.sessions || []);
    } catch (e) {
      if (!silent) toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Refresh every 15 seconds while screen is mounted
    pollRef.current = setInterval(() => load(true), 15_000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  return (
    <AdminGuard onBack={() => navigation.goBack()}>
      <LinearGradient colors={grad.screen} style={{ flex: 1 }}>
        <ScreenHeader
          title="Live Attendance"
          subtitle={`${sessions.length} currently checked in · auto-refresh 15s`}
          onBack={() => navigation.goBack()}
        />
        {loading ? (
          <LoadingState message="Loading active sessions…" />
        ) : sessions.length === 0 ? (
          <EmptyState icon="💤" title="Nobody is checked in" description="When users start a session, they will appear here." />
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(s) => s.id}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={g.accent} />}
            renderItem={({ item }) => (
              <View style={[st.row, { backgroundColor: g.glass, borderColor: g.border }]}>
                <View style={[st.dot, { backgroundColor: g.mint || '#3ee8c7' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[st.email, { color: g.text }]} numberOfLines={1}>
                    {item.userEmail || item.userId}
                  </Text>
                  <Text style={[st.meta, { color: g.textMuted }]} numberOfLines={1}>
                    {item.locationName ? `📍 ${item.locationName}` : (item.method || '·')}
                    {item.method ? `  ·  via ${item.method}` : ''}
                  </Text>
                  <Text style={[st.start, { color: g.textDim }]}>
                    started {fmtTime(item.checkInTime)}
                  </Text>
                </View>
                <View style={[st.timerBox, { backgroundColor: g.mintSoft || 'rgba(62,232,199,0.15)' }]}>
                  <Text style={[st.timerText, { color: g.mint || '#3ee8c7' }]}>
                    {fmtElapsed(item.elapsedMin)}
                  </Text>
                </View>
              </View>
            )}
          />
        )}
      </LinearGradient>
    </AdminGuard>
  );
}

const st = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  dot:       { width: 10, height: 10, borderRadius: 5 },
  email:     { fontSize: 14, fontWeight: '800' },
  meta:      { fontSize: 12, marginTop: 2 },
  start:     { fontSize: 11, fontWeight: '600', marginTop: 4 },
  timerBox:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  timerText: { fontSize: 13, fontWeight: '900' },
});
