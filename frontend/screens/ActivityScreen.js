// screens/ActivityScreen.js — user activity timeline

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import { getMyActivity, getApiErrorMessage } from '../services/api';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import { useToast } from '../components/ToastProvider';

const formatTime = (iso) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';

const iconFor = (type) => {
  if (!type) return '•';
  if (type.startsWith('check_in'))         return '🟢';
  if (type.startsWith('check_out'))        return '🔴';
  if (type.startsWith('location_request')) return '📍';
  if (type.startsWith('login'))            return '🔐';
  return '•';
};

export default function ActivityScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getMyActivity(100);
      setItems(res.data.activities || []);
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <LinearGradient colors={grad.screen} style={{ flex: 1 }}>
      <ScreenHeader
        title="Activity"
        subtitle="Your recent actions across the app"
        onBack={() => navigation.goBack()}
      />
      {loading ? (
        <LoadingState message="Loading activity…" />
      ) : items.length === 0 ? (
        <EmptyState icon="📋" title="No activity yet" description="Once you check in, request a location, or interact with the app, your timeline will show here." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item, index }) => (
            <View style={st.row}>
              <View style={st.timeline}>
                <Text style={st.icon}>{iconFor(item.type)}</Text>
                {index < items.length - 1 && <View style={[st.line, { backgroundColor: g.border }]} />}
              </View>
              <View style={[st.card, { backgroundColor: g.glass, borderColor: g.border }]}>
                <Text style={[st.title, { color: g.text }]} numberOfLines={2}>{item.title}</Text>
                {item.description ? (
                  <Text style={[st.desc, { color: g.textMuted }]} numberOfLines={3}>{item.description}</Text>
                ) : null}
                <Text style={[st.time, { color: g.textDim }]}>{formatTime(item.created_at)}</Text>
              </View>
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={g.accent} />}
        />
      )}
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  row:      { flexDirection: 'row', marginBottom: 12 },
  timeline: { width: 36, alignItems: 'center' },
  icon:     { fontSize: 20, height: 28, lineHeight: 26, textAlign: 'center' },
  line:     { width: 2, flex: 1, marginTop: 2, opacity: 0.5 },
  card:     { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, marginLeft: 6 },
  title:    { fontSize: 14, fontWeight: '700' },
  desc:     { fontSize: 12, marginTop: 4, lineHeight: 17 },
  time:     { fontSize: 11, fontWeight: '600', marginTop: 8 },
});
