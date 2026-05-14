// screens/HistoryScreen.js — per-day totals with search/filter and summary stats

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl,
  TextInput, TouchableOpacity, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getAttendanceDaily, getApiErrorMessage } from '../services/api';
import DailySummaryCard from '../components/DailySummaryCard';
import useThemeStore from '../store/themeStore';

const formatHM = (totalMinutes) => {
  const m = Math.max(0, Math.round(totalMinutes || 0));
  const h = Math.floor(m / 60), min = m % 60;
  if (h === 0) return `${min}m`;
  return `${h}h ${min.toString().padStart(2, '0')}m`;
};

export default function HistoryScreen() {
  const [days, setDays] = useState([]);
  const [filteredDays, setFilteredDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const headerFade = useRef(new Animated.Value(0)).current;

  const { colors: g, gradients: grad } = useThemeStore();

  const fetchDays = useCallback(async () => {
    setError(null);
    try {
      const res = await getAttendanceDaily();
      const fetched = res.data.days || [];
      setDays(fetched);
      setFilteredDays(fetched);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDays();
  }, [fetchDays]);

  useEffect(() => {
    if (!loading) {
      Animated.timing(headerFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
  }, [loading]);

  // Search filter
  useEffect(() => {
    if (!searchText.trim()) {
      setFilteredDays(days);
    } else {
      const q = searchText.toLowerCase();
      setFilteredDays(days.filter((d) => {
        const dateFormatted = new Date(d.date + 'T12:00:00').toLocaleDateString([], {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        }).toLowerCase();
        return d.date.includes(q) || dateFormatted.includes(q);
      }));
    }
  }, [searchText, days]);

  const toggleSearch = () => {
    const next = !showSearch;
    setShowSearch(next);
    if (!next) {
      setSearchText('');
      setFilteredDays(days);
    }
    Animated.spring(searchAnim, {
      toValue: next ? 1 : 0,
      tension: 60, friction: 8, useNativeDriver: false,
    }).start();
  };

  // Compute summary stats
  const totalMinutes = days.reduce((sum, d) => sum + (d.totalMinutes || 0), 0);
  const avgMinutesPerDay = days.length > 0 ? Math.round(totalMinutes / days.length) : 0;

  if (loading) {
    return (
      <LinearGradient colors={grad.screen} style={ss.gradient}>
        <View style={ss.centered}>
          <ActivityIndicator size="large" color={g.accent} />
          <Text style={[ss.loadingText, { color: g.textMuted }]}>Loading your days…</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={grad.screen} style={ss.gradient}>
      {/* Header */}
      <Animated.View style={[ss.header, { opacity: headerFade }]}>
        <View style={ss.headerRow}>
          <View>
            <Text style={[ss.title, { color: g.text }]}>Attendance History</Text>
            <Text style={[ss.subtitle, { color: g.textMuted }]}>
              {days.length} day{days.length !== 1 ? 's' : ''} recorded
            </Text>
          </View>
          <TouchableOpacity
            style={[ss.searchToggle, { backgroundColor: showSearch ? g.accentSoft : g.glass, borderColor: showSearch ? g.accent : g.border }]}
            onPress={toggleSearch}
          >
            <Text style={{ fontSize: 16 }}>{showSearch ? '✕' : '🔍'}</Text>
          </TouchableOpacity>
        </View>

        {/* Search bar (animated) */}
        <Animated.View style={{
          height: searchAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 52] }),
          overflow: 'hidden',
          marginTop: searchAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }),
        }}>
          <TextInput
            style={[ss.searchInput, { backgroundColor: g.glass, borderColor: showSearch ? g.accent : g.border, color: g.text }]}
            placeholder="Search by date, month, weekday…"
            placeholderTextColor={g.textDim}
            value={searchText}
            onChangeText={setSearchText}
            autoCorrect={false}
          />
        </Animated.View>

        {/* Stats row */}
        {days.length > 0 && !searchText && (
          <View style={ss.statsRow}>
            <LinearGradient colors={grad.card} style={[ss.statChip, { borderColor: g.border }]}>
              <Text style={[ss.statVal, { color: g.mint }]}>{formatHM(totalMinutes)}</Text>
              <Text style={[ss.statLbl, { color: g.textMuted }]}>Total</Text>
            </LinearGradient>
            <LinearGradient colors={grad.card} style={[ss.statChip, { borderColor: g.border }]}>
              <Text style={[ss.statVal, { color: g.accent }]}>{formatHM(avgMinutesPerDay)}</Text>
              <Text style={[ss.statLbl, { color: g.textMuted }]}>Daily Avg</Text>
            </LinearGradient>
            <LinearGradient colors={grad.card} style={[ss.statChip, { borderColor: g.border }]}>
              <Text style={[ss.statVal, { color: g.text }]}>{days.length}</Text>
              <Text style={[ss.statLbl, { color: g.textMuted }]}>Days</Text>
            </LinearGradient>
          </View>
        )}

        {/* Search results count */}
        {searchText.length > 0 && (
          <Text style={[ss.searchResults, { color: g.textMuted }]}>
            {filteredDays.length} result{filteredDays.length !== 1 ? 's' : ''} for "{searchText}"
          </Text>
        )}
      </Animated.View>

      {error ? (
        <View style={[ss.errorBox, { backgroundColor: g.errorBg, borderColor: g.errorBorder }]}>
          <Text style={[ss.errorText, { color: '#ffb4c0' }]}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        style={ss.list}
        data={filteredDays}
        keyExtractor={(item) => item.date}
        renderItem={({ item }) => <DailySummaryCard day={item} />}
        contentContainerStyle={filteredDays.length === 0 ? ss.emptyContainer : ss.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchDays(); }}
            tintColor={g.accent}
          />
        }
        ListEmptyComponent={
          <View style={ss.emptyBox}>
            <Text style={ss.emptyEmoji}>{searchText ? '🔍' : '📅'}</Text>
            <Text style={[ss.emptyTitle, { color: g.text }]}>
              {searchText ? 'No matches found' : 'No days yet'}
            </Text>
            <Text style={[ss.emptyText, { color: g.textDim }]}>
              {searchText
                ? `No attendance records match "${searchText}"`
                : 'Check in from the dashboard. Each day shows your combined hours; tap a card to see sessions.'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </LinearGradient>
  );
}

const ss = StyleSheet.create({
  gradient: { flex: 1 },
  list: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 14, fontSize: 14 },

  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 5 },
  searchToggle: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  searchInput: {
    borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 15,
  },
  searchResults: { fontSize: 12, marginTop: 8, fontWeight: '500' },

  statsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  statChip: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1 },
  statVal: { fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statLbl: { fontSize: 11, marginTop: 3, fontWeight: '600' },

  errorBox: { marginHorizontal: 20, marginBottom: 10, borderRadius: 14, padding: 14, borderWidth: 1 },
  errorText: { fontSize: 13, lineHeight: 20 },

  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyBox: { alignItems: 'center', maxWidth: 300 },
  emptyEmoji: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
