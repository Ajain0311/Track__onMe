// screens/HistoryScreen.js — per-day totals (hours) with expandable session detail

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getAttendanceDaily, getApiErrorMessage } from '../services/api';
import DailySummaryCard from '../components/DailySummaryCard';
import useThemeStore from '../store/themeStore';

const staticStyles = StyleSheet.create({
  gradient: { flex: 1 },
  list: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 14, fontSize: 14 },

  header: { paddingHorizontal: 24, paddingTop: 58, paddingBottom: 18 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 6 },

  errorBox: {
    marginHorizontal: 24,
    marginBottom: 12,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  errorText: { fontSize: 13, lineHeight: 20 },

  listContent: { paddingHorizontal: 24, paddingBottom: 100 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyBox: { alignItems: 'center', maxWidth: 300 },
  emptyEmoji: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});

export default function HistoryScreen() {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  
  const { colors: g, gradients: grad } = useThemeStore();

  const fetchDays = useCallback(async () => {
    setError(null);
    try {
      const res = await getAttendanceDaily();
      setDays(res.data.days || []);
    } catch (err) {
      setError(getApiErrorMessage(err));
      console.error('[History] Error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDays();
  }, [fetchDays]);

  if (loading) {
    return (
      <LinearGradient colors={grad.screen} style={staticStyles.gradient}>
        <View style={staticStyles.centered}>
          <ActivityIndicator size="large" color={g.accent} />
          <Text style={[staticStyles.loadingText, { color: g.textMuted }]}>Loading your days…</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={grad.screen} style={staticStyles.gradient}>
      <View style={staticStyles.header}>
        <Text style={[staticStyles.title, { color: g.text }]}>Time by day</Text>
        <Text style={[staticStyles.subtitle, { color: g.textMuted }]}>
          {days.length} day{days.length !== 1 ? 's' : ''} with attendance
        </Text>
      </View>

      {error ? (
        <View style={[staticStyles.errorBox, { backgroundColor: g.errorBg, borderColor: g.errorBorder }]}>
          <Text style={[staticStyles.errorText, { color: '#ffb4c0' }]}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        style={staticStyles.list}
        data={days}
        keyExtractor={(item) => item.date}
        renderItem={({ item }) => <DailySummaryCard day={item} />}
        contentContainerStyle={days.length === 0 ? staticStyles.emptyContainer : staticStyles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDays(); }} tintColor={g.accent} />
        }
        ListEmptyComponent={
          <View style={staticStyles.emptyBox}>
            <Text style={staticStyles.emptyEmoji}>📅</Text>
            <Text style={[staticStyles.emptyTitle, { color: g.text }]}>No days yet</Text>
            <Text style={[staticStyles.emptyText, { color: g.textDim }]}>
              Check in from the dashboard. Each day shows your combined hours; tap a card to see individual sessions.
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </LinearGradient>
  );
}
