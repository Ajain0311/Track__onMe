// screens/AnalyticsScreen.js — Analytics dashboard with daily/weekly/monthly stats

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useTimeStore from '../store/timeStore';
import useThemeStore from '../store/themeStore';
import { getAttendanceDaily, getApiErrorMessage } from '../services/api';

const { width: screenWidth } = Dimensions.get('window');

const formatDuration = (totalSeconds) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
};

const formatDurationFull = (totalSeconds) => {
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const getDayName = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
};

const getDateLabel = (dateStr) => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (dateStr === today.toISOString().split('T')[0]) return 'Today';
  if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
  return getDayName(dateStr);
};

export default function AnalyticsScreen() {
  const { colors: g, gradients: grad, isDark } = useThemeStore();
  const { 
    totalTimeSeconds, 
    dailyTotals, 
    getWeekTotal, 
    getMonthTotal,
    sessions,
    initialize: initializeTimeStore,
  } = useTimeStore();
  
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('week'); // 'week', 'month', 'all'
  const [serverData, setServerData] = useState([]);
  
  useEffect(() => {
    initializeTimeStore();
    loadData();
  }, []);
  
  const loadData = useCallback(async () => {
    setError(null);
    try {
      // Fetch from server for additional data
      const res = await getAttendanceDaily();
      setServerData(res.data?.records || []);
    } catch (err) {
      console.error('[Analytics] Error loading data:', err);
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  
  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };
  
  // Get last 7 days data
  const getWeekData = () => {
    const data = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const seconds = dailyTotals[dateStr] || 0;
      
      data.push({
        date: dateStr,
        label: i === 0 ? 'Today' : getDayName(dateStr),
        seconds,
        hours: seconds / 3600,
      });
    }
    return data;
  };
  
  // Get max hours for chart scaling
  const weekData = getWeekData();
  const maxHours = Math.max(...weekData.map(d => d.hours), 1);
  
  // Calculate stats
  const todayTotal = dailyTotals[new Date().toISOString().split('T')[0]] || 0;
  const weekTotal = getWeekTotal();
  const monthTotal = getMonthTotal();
  const averageDaily = Object.keys(dailyTotals).length > 0 
    ? Object.values(dailyTotals).reduce((a, b) => a + b, 0) / Object.keys(dailyTotals).length 
    : 0;
  
  // Get recent sessions
  const recentSessions = sessions.slice(0, 10);
  
  if (loading) {
    return (
      <LinearGradient colors={grad.screen} style={styles.fill}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={g.accent} />
          <Text style={[styles.loadingText, { color: g.textMuted }]}>Loading analytics...</Text>
        </View>
      </LinearGradient>
    );
  }
  
  return (
    <LinearGradient colors={grad.screen} style={styles.fill}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.inner}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={g.accent} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: g.text }]}>Analytics</Text>
          <Text style={[styles.subtitle, { color: g.textMuted }]}>Track your productivity</Text>
        </View>
        
        {error && (
          <View style={[styles.errorBanner, { backgroundColor: g.errorBg, borderColor: g.errorBorder }]}>
            <Text style={[styles.errorText, { color: g.coral }]}>{error}</Text>
          </View>
        )}
        
        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <LinearGradient colors={grad.card} style={[styles.summaryCard, { borderColor: g.border }]}>
            <Text style={[styles.summaryValue, { color: g.mint }]}>{formatDuration(todayTotal)}</Text>
            <Text style={[styles.summaryLabel, { color: g.textMuted }]}>Today</Text>
          </LinearGradient>
          
          <LinearGradient colors={grad.card} style={[styles.summaryCard, { borderColor: g.border }]}>
            <Text style={[styles.summaryValue, { color: g.accent }]}>{formatDuration(weekTotal)}</Text>
            <Text style={[styles.summaryLabel, { color: g.textMuted }]}>This Week</Text>
          </LinearGradient>
        </View>
        
        <View style={styles.summaryRow}>
          <LinearGradient colors={grad.card} style={[styles.summaryCard, { borderColor: g.border }]}>
            <Text style={[styles.summaryValue, { color: g.text }]}>{formatDuration(monthTotal)}</Text>
            <Text style={[styles.summaryLabel, { color: g.textMuted }]}>This Month</Text>
          </LinearGradient>
          
          <LinearGradient colors={grad.card} style={[styles.summaryCard, { borderColor: g.border }]}>
            <Text style={[styles.summaryValue, { color: g.coral }]}>{formatDuration(averageDaily)}</Text>
            <Text style={[styles.summaryLabel, { color: g.textMuted }]}>Daily Avg</Text>
          </LinearGradient>
        </View>
        
        {/* Weekly Chart */}
        <LinearGradient colors={grad.card} style={[styles.chartCard, { borderColor: g.border }]}>
          <Text style={[styles.chartTitle, { color: g.text }]}>Last 7 Days</Text>
          
          <View style={styles.chartContainer}>
            {weekData.map((day, index) => {
              const barHeight = day.hours > 0 ? Math.max((day.hours / maxHours) * 120, 8) : 4;
              const isToday = index === 6;
              
              return (
                <View key={day.date} style={styles.barContainer}>
                  <View style={styles.barWrapper}>
                    <View 
                      style={[
                        styles.bar, 
                        { 
                          height: barHeight,
                          backgroundColor: isToday ? g.mint : g.accentSoft,
                        }
                      ]} 
                    />
                  </View>
                  <Text style={[styles.barLabel, { color: isToday ? g.mint : g.textMuted }]}>
                    {day.label}
                  </Text>
                  <Text style={[styles.barValue, { color: g.textDim }]}>
                    {day.hours > 0 ? `${Math.round(day.hours)}h` : '-'}
                  </Text>
                </View>
              );
            })}
          </View>
        </LinearGradient>
        
        {/* Total Accumulated Time */}
        <LinearGradient colors={grad.card} style={[styles.totalCard, { borderColor: g.border }]}>
          <View style={styles.totalHeader}>
            <Text style={[styles.totalLabel, { color: g.textMuted }]}>Total Accumulated Time</Text>
            <View style={[styles.totalBadge, { backgroundColor: g.accentSoft }]}>
              <Text style={[styles.totalBadgeText, { color: g.accent }]}>All Time</Text>
            </View>
          </View>
          <Text style={[styles.totalValue, { color: g.text }]}>{formatDurationFull(totalTimeSeconds)}</Text>
          <Text style={[styles.totalSubtext, { color: g.textDim }]}>
            Across {sessions.length} sessions
          </Text>
        </LinearGradient>
        
        {/* Recent Sessions */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: g.text }]}>Recent Sessions</Text>
        </View>
        
        {recentSessions.length === 0 ? (
          <LinearGradient colors={grad.card} style={[styles.emptyCard, { borderColor: g.border }]}>
            <Text style={[styles.emptyText, { color: g.textMuted }]}>No sessions yet</Text>
            <Text style={[styles.emptySubtext, { color: g.textDim }]}>
              Start checking in to track your time
            </Text>
          </LinearGradient>
        ) : (
          <View style={styles.sessionsList}>
            {recentSessions.map((session, index) => (
              <LinearGradient 
                key={session.id || index} 
                colors={grad.card} 
                style={[styles.sessionItem, { borderColor: g.border }]}
              >
                <View style={styles.sessionLeft}>
                  <Text style={[styles.sessionDate, { color: g.text }]}>
                    {getDateLabel(session.date)}
                  </Text>
                  <Text style={[styles.sessionTime, { color: g.textDim }]}>
                    {new Date(session.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                    {' - '}
                    {new Date(session.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={styles.sessionRight}>
                  <Text style={[styles.sessionDuration, { color: g.mint }]}>
                    {formatDuration(session.duration)}
                  </Text>
                </View>
              </LinearGradient>
            ))}
          </View>
        )}
        
        <View style={styles.bottomPadding} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flex: 1 },
  inner: { padding: 24, paddingTop: 56 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  
  header: { marginBottom: 24 },
  title: { fontSize: 32, fontWeight: '900' },
  subtitle: { fontSize: 15, marginTop: 4 },
  
  errorBanner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  errorText: { fontSize: 13 },
  
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  summaryValue: { fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
  summaryLabel: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  
  chartCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  chartTitle: { fontSize: 16, fontWeight: '800', marginBottom: 16 },
  chartContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-end',
    height: 150,
    paddingTop: 10,
  },
  barContainer: { 
    flex: 1, 
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barWrapper: {
    width: 24,
    height: 120,
    justifyContent: 'flex-end',
    borderRadius: 4,
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 4,
  },
  barLabel: { fontSize: 11, marginTop: 8, fontWeight: '600' },
  barValue: { fontSize: 10, marginTop: 2 },
  
  totalCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
  },
  totalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 13, fontWeight: '600' },
  totalBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  totalBadgeText: { fontSize: 11, fontWeight: '700' },
  totalValue: { fontSize: 32, fontWeight: '900', marginTop: 12, fontVariant: ['tabular-nums'] },
  totalSubtext: { fontSize: 13, marginTop: 4 },
  
  sectionHeader: { marginTop: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  
  emptyCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptySubtext: { fontSize: 13, marginTop: 6 },
  
  sessionsList: { gap: 8 },
  sessionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  sessionLeft: { flex: 1 },
  sessionDate: { fontSize: 14, fontWeight: '700' },
  sessionTime: { fontSize: 12, marginTop: 2 },
  sessionRight: {},
  sessionDuration: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  
  bottomPadding: { height: 40 },
});
