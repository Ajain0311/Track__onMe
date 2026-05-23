// screens/admin/AdminAuditLogsScreen.js — paginated audit trail viewer

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../../store/themeStore';
import { adminGetAuditLogs, getApiErrorMessage } from '../../services/api';
import ScreenHeader from '../../components/ScreenHeader';
import EmptyState from '../../components/EmptyState';
import LoadingState from '../../components/LoadingState';
import AdminGuard from '../../components/AdminGuard';
import { useToast } from '../../components/ToastProvider';

const formatTime = (iso) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' }) : '';

export default function AdminAuditLogsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async (p = 1, append = false) => {
    try {
      const res = await adminGetAuditLogs({ page: p, per_page: 50 });
      const next = res.data?.rows || [];
      setRows((prev) => append ? [...prev, ...next] : next);
      setHasMore(next.length === 50);
      setPage(p);
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(1, false); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(1, false); };
  const onEndReached = () => { if (!loading && hasMore) load(page + 1, true); };

  return (
    <AdminGuard onBack={() => navigation.goBack()}>
      <LinearGradient colors={grad.screen} style={{ flex: 1 }}>
        <ScreenHeader title="Audit Logs" subtitle="Sensitive admin actions" onBack={() => navigation.goBack()} />
        {loading && rows.length === 0 ? (
          <LoadingState message="Loading audit trail…" />
        ) : rows.length === 0 ? (
          <EmptyState icon="📜" title="No audit events yet" description="Admin actions (creating/updating locations, role changes, request approvals) appear here." />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            onEndReachedThreshold={0.5}
            onEndReached={onEndReached}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={g.accent} />}
            renderItem={({ item }) => (
              <View style={[st.row, { backgroundColor: g.glass, borderColor: g.border }]}>
                <View style={st.head}>
                  <Text style={[st.action, { color: g.accent }]}>{item.action}</Text>
                  <Text style={[st.time, { color: g.textDim }]}>{formatTime(item.created_at)}</Text>
                </View>
                <Text style={[st.actor, { color: g.text }]} numberOfLines={1}>
                  {item.actor_email || 'system'}
                </Text>
                <Text style={[st.target, { color: g.textMuted }]} numberOfLines={1}>
                  {item.resource}{item.resource_id ? ` · ${item.resource_id.slice(0, 8)}` : ''}
                </Text>
                {item.metadata && Object.keys(item.metadata).length > 0 && (
                  <Text style={[st.meta, { color: g.textDim }]} numberOfLines={3}>
                    {JSON.stringify(item.metadata)}
                  </Text>
                )}
              </View>
            )}
          />
        )}
      </LinearGradient>
    </AdminGuard>
  );
}

const st = StyleSheet.create({
  row:    { padding: 14, borderRadius: 12, borderWidth: 1 },
  head:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  action: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  time:   { fontSize: 11, fontWeight: '600' },
  actor:  { fontSize: 13, fontWeight: '700' },
  target: { fontSize: 12, marginTop: 2 },
  meta:   { fontSize: 11, marginTop: 6, fontFamily: 'monospace' },
});
