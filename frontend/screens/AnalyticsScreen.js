// screens/AnalyticsScreen.js — Analytics with animated chart + goal tracking

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useTimeStore from '../store/timeStore';
import useThemeStore from '../store/themeStore';
import useGoalStore from '../store/goalStore';
import { getAttendanceDaily, getApiErrorMessage } from '../services/api';

const formatDuration = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const formatDurationFull = (s) => {
  const h = Math.floor(s / 3600).toString().padStart(2, '0');
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${h}:${m}:${sec}`;
};

const getDayName = (dateStr) => new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });

const getDateLabel = (dateStr) => {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return getDayName(dateStr);
};

// Single animated bar component
function AnimatedBar({ day, maxHours, isToday, g, delay }) {
  const barHeight = day.hours > 0 ? Math.max((day.hours / maxHours) * 110, 6) : 4;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 480,
      delay,
      useNativeDriver: true,
    }).start();
  }, [day.hours]);

  return (
    <View style={styles.barContainer}>
      <View style={[styles.barWrapper, { height: 110 }]}>
        <Animated.View style={[
          styles.bar,
          {
            height: barHeight,
            backgroundColor: isToday ? g.mint : day.hours > 0 ? g.accentSoft : 'rgba(255,255,255,0.06)',
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          },
        ]} />
      </View>
      <Text style={[styles.barLabel, { color: isToday ? g.mint : g.textMuted }]}>{day.label}</Text>
      <Text style={[styles.barValue, { color: g.textDim }]}>
        {day.hours > 0 ? `${Math.round(day.hours)}h` : '—'}
      </Text>
    </View>
  );
}

export default function AnalyticsScreen() {
  const { colors: g, gradients: grad } = useThemeStore();
  const { totalTimeSeconds, dailyTotals, getWeekTotal, getMonthTotal, sessions, initialize: initializeTimeStore } = useTimeStore();
  const { goals, getDailyGoalProgress, computeStreak } = useGoalStore();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const statAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    initializeTimeStore();
    loadData();
  }, []);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      await getAttendanceDaily();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Animate stat cards in after load
  useEffect(() => {
    if (!loading) {
      Animated.stagger(80, statAnims.map((a) =>
        Animated.spring(a, { toValue: 1, tension: 55, friction: 7, useNativeDriver: true })
      )).start();
    }
  }, [loading]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getWeekData = () => {
    const data = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const seconds = dailyTotals[dateStr] || 0;
      data.push({ date: dateStr, label: i === 0 ? 'Today' : getDayName(dateStr), seconds, hours: seconds / 3600 });
    }
    return data;
  };

  const weekData = getWeekData();
  const maxHours = Math.max(...weekData.map((d) => d.hours), 1);

  const todayTotal = dailyTotals[new Date().toISOString().split('T')[0]] || 0;
  const weekTotal = getWeekTotal();
  const monthTotal = getMonthTotal();
  const averageDaily = Object.keys(dailyTotals).length > 0
    ? Object.values(dailyTotals).reduce((a, b) => a + b, 0) / Object.keys(dailyTotals).length
    : 0;

  const recentSessions = sessions.slice(0, 10);
  const streak = computeStreak(dailyTotals);

  // Weekly goal: how many days this week hit >= 50% of daily goal
  const goalSeconds = goals.dailyHoursGoal * 3600;
  const goalDaysThisWeek = weekData.filter((d) => d.seconds >= goalSeconds * 0.5).length;
  const weekGoalPct = Math.round((goalDaysThisWeek / Math.max(goals.weeklyDaysGoal, 1)) * 100);

  // Productivity score: blend of goal completion
  const todayGoalPct = goalSeconds > 0 ? Math.min(Math.round((todayTotal / goalSeconds) * 100), 100) : 0;

  const summaryStats = [
    { label: 'Today', value: formatDuration(todayTotal), color: g.mint },
    { label: 'This Week', value: formatDuration(weekTotal), color: g.accent },
    { label: 'This Month', value: formatDuration(monthTotal), color: g.text },
    { label: 'Daily Avg', value: formatDuration(averageDaily), color: g.coral },
  ];

  if (loading) {
    return (
      <LinearGradient colors={grad.screen} style={styles.fill}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={g.accent} />
          <Text style={[styles.loadingText, { color: g.textMuted }]}>Loading analytics…</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={grad.screen} style={styles.fill}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.inner}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={g.accent} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: g.text }]}>Analytics</Text>
          <Text style={[styles.subtitle, { color: g.textMuted }]}>Track your productivity</Text>
        </View>

        {error && (
          <View style={[styles.errorBanner, { backgroundColor: g.errorBg, borderColor: g.errorBorder }]}>
            <Text style={[styles.errorText, { color: g.coral }]}>{error}</Text>
          </View>
        )}

        {/* Summary stat cards (animated) */}
        <View style={styles.summaryRow}>
          {summaryStats.slice(0, 2).map((stat, i) => (
            <Animated.View key={stat.label} style={[
              { flex: 1 },
              { opacity: statAnims[i], transform: [{ translateY: statAnims[i].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
            ]}>
              <LinearGradient colors={grad.card} style={[styles.summaryCard, { borderColor: g.border }]}>
                <Text style={[styles.summaryValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={[styles.summaryLabel, { color: g.textMuted }]}>{stat.label}</Text>
              </LinearGradient>
            </Animated.View>
          ))}
        </View>
        <View style={styles.summaryRow}>
          {summaryStats.slice(2, 4).map((stat, i) => (
            <Animated.View key={stat.label} style={[
              { flex: 1 },
              { opacity: statAnims[i + 2], transform: [{ translateY: statAnims[i + 2].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
            ]}>
              <LinearGradient colors={grad.card} style={[styles.summaryCard, { borderColor: g.border }]}>
                <Text style={[styles.summaryValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={[styles.summaryLabel, { color: g.textMuted }]}>{stat.label}</Text>
              </LinearGradient>
            </Animated.View>
          ))}
        </View>

        {/* Goal progress + streak cards */}
        <View style={styles.summaryRow}>
          <LinearGradient colors={grad.card} style={[styles.summaryCard, { flex: 1, borderColor: g.border }]}>
            <Text style={[styles.summaryValue, { color: todayGoalPct >= 100 ? g.mint : todayGoalPct >= 50 ? g.accent : g.coral }]}>
              {todayGoalPct}%
            </Text>
            <Text style={[styles.summaryLabel, { color: g.textMuted }]}>Goal Today</Text>
          </LinearGradient>
          <LinearGradient colors={grad.card} style={[styles.summaryCard, { flex: 1, borderColor: g.border }]}>
            <Text style={[styles.summaryValue, { color: streak > 0 ? '#ffb347' : g.textMuted }]}>
              {streak > 0 ? `🔥 ${streak}` : '0'}
            </Text>
            <Text style={[styles.summaryLabel, { color: g.textMuted }]}>Day Streak</Text>
          </LinearGradient>
        </View>

        {/* Animated weekly chart */}
        <LinearGradient colors={grad.card} style={[styles.chartCard, { borderColor: g.border }]}>
          <View style={styles.chartHeader}>
            <Text style={[styles.chartTitle, { color: g.text }]}>Last 7 Days</Text>
            <View style={[styles.chartBadge, { backgroundColor: g.accentSoft }]}>
              <Text style={{ color: g.accent, fontSize: 10, fontWeight: '700' }}>HOURS</Text>
            </View>
          </View>
          <View style={[styles.chartContainer]}>
            {weekData.map((day, index) => (
              <AnimatedBar
                key={day.date}
                day={day}
                maxHours={maxHours}
                isToday={index === 6}
                g={g}
                delay={index * 55}
              />
            ))}
          </View>
          {/* Goal line indicator */}
          {goalSeconds > 0 && (
            <View style={styles.goalLineRow}>
              <View style={[styles.goalLineDash, { backgroundColor: g.accent }]} />
              <Text style={{ color: g.accent, fontSize: 10, fontWeight: '600', marginLeft: 6 }}>
                Goal: {goals.dailyHoursGoal}h/day
              </Text>
            </View>
          )}
        </LinearGradient>

        {/* Weekly goal progress */}
        <LinearGradient colors={grad.card} style={[styles.weekGoalCard, { borderColor: g.border }]}>
          <View style={styles.weekGoalHeader}>
            <Text style={[styles.chartTitle, { color: g.text }]}>Weekly Goal</Text>
            <Text style={{ color: weekGoalPct >= 100 ? g.mint : g.accent, fontSize: 16, fontWeight: '900' }}>
              {goalDaysThisWeek}/{goals.weeklyDaysGoal} days
            </Text>
          </View>
          <View style={[styles.goalTrack, { backgroundColor: g.glass }]}>
            <View style={[styles.goalFill, {
              width: `${Math.min(weekGoalPct, 100)}%`,
              backgroundColor: weekGoalPct >= 100 ? g.mint : g.accent,
            }]} />
          </View>
          <Text style={{ color: g.textMuted, fontSize: 12, marginTop: 8 }}>
            {weekGoalPct >= 100
              ? '🎉 Weekly goal achieved!'
              : `${goals.weeklyDaysGoal - goalDaysThisWeek} more day${goals.weeklyDaysGoal - goalDaysThisWeek !== 1 ? 's' : ''} to hit your weekly goal`}
          </Text>
        </LinearGradient>

        {/* All-time total */}
        <LinearGradient colors={grad.card} style={[styles.totalCard, { borderColor: g.border }]}>
          <View style={styles.totalHeader}>
            <Text style={[styles.totalLabel, { color: g.textMuted }]}>Total Accumulated Time</Text>
            <View style={[styles.totalBadge, { backgroundColor: g.accentSoft }]}>
              <Text style={[styles.totalBadgeText, { color: g.accent }]}>All Time</Text>
            </View>
          </View>
          <Text style={[styles.totalValue, { color: g.text }]}>{formatDurationFull(totalTimeSeconds)}</Text>
          <Text style={[styles.totalSubtext, { color: g.textDim }]}>Across {sessions.length} sessions</Text>
        </LinearGradient>

        {/* Recent sessions */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: g.text }]}>Recent Sessions</Text>
        </View>

        {recentSessions.length === 0 ? (
          <LinearGradient colors={grad.card} style={[styles.emptyCard, { borderColor: g.border }]}>
            <Text style={{ fontSize: 32, marginBottom: 10 }}>📋</Text>
            <Text style={[styles.emptyText, { color: g.textMuted }]}>No sessions yet</Text>
            <Text style={[styles.emptySubtext, { color: g.textDim }]}>Start checking in to track your time</Text>
          </LinearGradient>
        ) : (
          <View style={styles.sessionsList}>
            {recentSessions.map((session, index) => (
              <LinearGradient key={session.id || index} colors={grad.card} style={[styles.sessionItem, { borderColor: g.border }]}>
                <View style={styles.sessionLeft}>
                  <Text style={[styles.sessionDate, { color: g.text }]}>{getDateLabel(session.date)}</Text>
                  <Text style={[styles.sessionTime, { color: g.textDim }]}>
                    {new Date(session.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' – '}
                    {session.checkOutTime
                      ? new Date(session.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'In progress'}
                  </Text>
                </View>
                <View style={[styles.sessionDurBadge, { backgroundColor: g.mintSoft }]}>
                  <Text style={[styles.sessionDuration, { color: g.mint }]}>{formatDuration(session.duration)}</Text>
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
  inner: { padding: 20, paddingTop: 56 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  header: { marginBottom: 22 },
  title: { fontSize: 32, fontWeight: '900' },
  subtitle: { fontSize: 15, marginTop: 4 },
  errorBanner: { borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1 },
  errorText: { fontSize: 13 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  summaryCard: { borderRadius: 16, padding: 16, borderWidth: 1, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
  summaryLabel: { fontSize: 12, marginTop: 4, fontWeight: '600' },

  chartCard: { borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  chartTitle: { fontSize: 16, fontWeight: '800' },
  chartBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
  chartContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 140, paddingTop: 10 },
  barContainer: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barWrapper: { width: 22, justifyContent: 'flex-end', borderRadius: 4, overflow: 'visible' },
  bar: { width: '100%', borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 11, marginTop: 8, fontWeight: '600' },
  barValue: { fontSize: 10, marginTop: 2 },
  goalLineRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  goalLineDash: { width: 20, height: 2, borderRadius: 1 },

  weekGoalCard: { borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1 },
  weekGoalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  goalTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  goalFill: { height: '100%', borderRadius: 4 },

  totalCard: { borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1 },
  totalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 13, fontWeight: '600' },
  totalBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  totalBadgeText: { fontSize: 11, fontWeight: '700' },
  totalValue: { fontSize: 30, fontWeight: '900', marginTop: 12, fontVariant: ['tabular-nums'] },
  totalSubtext: { fontSize: 13, marginTop: 4 },

  sectionHeader: { marginTop: 6, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  emptyCard: { borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed' },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptySubtext: { fontSize: 13, marginTop: 6 },
  sessionsList: { gap: 8 },
  sessionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 14, padding: 14, borderWidth: 1 },
  sessionLeft: { flex: 1 },
  sessionDate: { fontSize: 14, fontWeight: '700' },
  sessionTime: { fontSize: 12, marginTop: 2 },
  sessionDurBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  sessionDuration: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  bottomPadding: { height: 40 },
});
