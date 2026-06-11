// screens/AnalyticsScreen.js — Server-backed personal analytics dashboard

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl, Animated, TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../store/themeStore';
import useGoalStore from '../store/goalStore';
import { getPersonalAnalytics, getPersonalPunctuality, getAttendanceDaily, getApiErrorMessage } from '../services/api';
import { useTimeStore } from '../store/timeStore';

// ── Helpers ────────────────────────────────────────────────────────────────────

const pad2 = (n) => String(n).padStart(2, '0');
const fmtSec = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const fmtFull = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function RateCircle({ rate, label, color, size = 80 }) {
  const { colors: g } = useThemeStore();
  const strokeWidth = 7;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = rate != null ? Math.min(rate, 100) / 100 : 0;
  const dash = filled * circumference;
  const gap = circumference - dash;

  return (
    <View style={{ alignItems: 'center' }}>
      {/* SVG-style ring using border trick */}
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: strokeWidth,
        borderColor: g.glass,
        justifyContent: 'center', alignItems: 'center',
        position: 'relative',
        overflow: 'visible',
      }}>
        {/* Filled arc approximated with a colored ring overlay */}
        <View style={{
          position: 'absolute', width: size, height: size, borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: color,
          opacity: filled,
        }} />
        <Text style={{ fontSize: size < 70 ? 14 : 17, fontWeight: '900', color: rate != null ? color : g.textDim }}>
          {rate != null ? `${rate}%` : '—'}
        </Text>
      </View>
      <Text style={{ color: g.textMuted, fontSize: 12, marginTop: 6, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function TrendBar({ day, maxHours, g }) {
  const ratio = maxHours > 0 ? (day.totalHours / maxHours) : 0;
  const h = Math.max(ratio * 80, day.present && !day.isFuture ? 3 : 0);
  const color = day.isFuture ? 'transparent'
    : day.isWeekend ? g.glass
    : day.present ? g.mint : g.errorBorder;

  const shortDate = day.date.slice(8); // DD
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <View style={{ height: 80, justifyContent: 'flex-end' }}>
        <View style={{ width: 8, height: Math.max(h, 2), borderRadius: 4, backgroundColor: color }} />
      </View>
      <Text style={{ color: g.textDim, fontSize: 8, marginTop: 4 }}>{shortDate}</Text>
    </View>
  );
}

function StatCard({ label, value, color, anim, g, grad }) {
  return (
    <Animated.View style={[
      { flex: 1 },
      { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
    ]}>
      <LinearGradient colors={grad.card} style={[ss.statCard, { borderColor: g.border }]}>
        <Text style={[ss.statVal, { color }]}>{value}</Text>
        <Text style={[ss.statLbl, { color: g.textMuted }]}>{label}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function AnalyticsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const { goals, computeStreak } = useGoalStore();
  const { totalTimeSeconds, dailyTotals, getWeekTotal, getMonthTotal, sessions } = useTimeStore();

  const [serverData, setServerData]       = useState(null);
  const [punctuality, setPunctuality]     = useState(null);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [error, setError]                 = useState(null);

  const statAnims = useRef([0, 1, 2, 3, 4, 5].map(() => new Animated.Value(0))).current;

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [analyticsRes, punctualityRes] = await Promise.all([
        getPersonalAnalytics(),
        getPersonalPunctuality().catch(() => null),
        getAttendanceDaily().catch(() => null),
      ]);
      setServerData(analyticsRes.data);
      if (punctualityRes) setPunctuality(punctualityRes.data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => {
    if (!loading) {
      Animated.stagger(60, statAnims.map((a) =>
        Animated.spring(a, { toValue: 1, tension: 55, friction: 7, useNativeDriver: true })
      )).start();
    }
  }, [loading]);

  // Local fallbacks while server data loads
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLocal = dailyTotals[todayStr] || 0;
  const weekLocal  = getWeekTotal();
  const monthLocal = getMonthTotal();
  const streak     = computeStreak(dailyTotals);
  const goalSecs   = goals.dailyHoursGoal * 3600;
  const todayGoalPct = goalSecs > 0 ? Math.min(Math.round((todayLocal / goalSecs) * 100), 100) : 0;

  // Server data
  const thisMonthRate  = serverData?.thisMonth?.rate ?? null;
  const lastMonthRate  = serverData?.lastMonth?.rate ?? null;
  const yearRate       = serverData?.year?.rate ?? null;
  const trendDates     = serverData?.trendDates || [];
  const allTime        = serverData?.allTime;
  const maxHours       = Math.max(...trendDates.map((d) => d.totalHours), 1);

  // MoM delta
  const momDelta = (thisMonthRate != null && lastMonthRate != null)
    ? thisMonthRate - lastMonthRate : null;

  const summaryStats = [
    { label: 'Today', value: fmtSec(todayLocal), color: g.mint },
    { label: 'This Week', value: fmtSec(weekLocal), color: g.accent },
    { label: 'This Month', value: fmtSec(monthLocal), color: g.text },
    { label: 'Daily Avg', value: allTime ? `${allTime.avgHoursPerDay}h` : fmtSec(0), color: g.coral },
    { label: 'Goal Today', value: `${todayGoalPct}%`, color: todayGoalPct >= 100 ? g.mint : todayGoalPct >= 50 ? g.accent : g.coral },
    { label: 'Day Streak', value: streak > 0 ? `🔥 ${streak}` : '0', color: streak > 0 ? '#ffb347' : g.textMuted },
  ];

  if (loading) {
    return (
      <LinearGradient colors={grad.screen} style={ss.fill}>
        <View style={ss.centered}>
          <ActivityIndicator size="large" color={g.accent} />
          <Text style={[ss.loadingText, { color: g.textMuted }]}>Loading analytics…</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={grad.screen} style={ss.fill}>
      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.inner}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={g.accent} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={ss.header}>
          <Text style={[ss.title, { color: g.text }]}>Analytics</Text>
          <Text style={[ss.subtitle, { color: g.textMuted }]}>Your attendance performance</Text>
        </View>

        {error && (
          <View style={[ss.errorBanner, { backgroundColor: g.errorBg, borderColor: g.errorBorder }]}>
            <Text style={[ss.errorText, { color: g.coral }]}>{error}</Text>
          </View>
        )}

        {/* Attendance rate circles */}
        <LinearGradient colors={grad.card} style={[ss.rateCard, { borderColor: g.border }]}>
          <Text style={[ss.cardTitle, { color: g.text }]}>Attendance Rate</Text>
          <View style={ss.rateRow}>
            <RateCircle rate={thisMonthRate} label="This Month" color={g.mint} />
            <View style={[ss.rateDivider, { backgroundColor: g.border }]} />
            <RateCircle rate={lastMonthRate} label="Last Month" color={g.accent} size={68} />
            <View style={[ss.rateDivider, { backgroundColor: g.border }]} />
            <RateCircle rate={yearRate} label="This Year" color={g.coral} size={68} />
          </View>
          {momDelta != null && (
            <View style={ss.momRow}>
              <Text style={[ss.momText, { color: momDelta >= 0 ? g.mint : g.coral }]}>
                {momDelta >= 0 ? '↑' : '↓'} {Math.abs(momDelta)}% vs last month
              </Text>
            </View>
          )}
          {serverData?.thisMonth && (
            <Text style={[ss.rateCaption, { color: g.textDim }]}>
              {serverData.thisMonth.present} present / {serverData.thisMonth.workdays} working days
            </Text>
          )}
        </LinearGradient>

        {/* 30-day trend */}
        {trendDates.length > 0 && (
          <LinearGradient colors={grad.card} style={[ss.trendCard, { borderColor: g.border }]}>
            <View style={ss.cardHeaderRow}>
              <Text style={[ss.cardTitle, { color: g.text }]}>30-Day Trend</Text>
              <View style={ss.legendRow}>
                <View style={[ss.dot, { backgroundColor: g.mint }]} />
                <Text style={[ss.legendText, { color: g.textDim }]}>Present</Text>
                <View style={[ss.dot, { backgroundColor: g.errorBorder }]} />
                <Text style={[ss.legendText, { color: g.textDim }]}>Absent</Text>
              </View>
            </View>
            <View style={ss.trendBars}>
              {trendDates.map((d) => (
                <TrendBar key={d.date} day={d} maxHours={maxHours} g={g} />
              ))}
            </View>
          </LinearGradient>
        )}

        {/* Punctuality card */}
        {punctuality && (
          <LinearGradient colors={grad.card} style={[ss.rateCard, { borderColor: g.border }]}>
            <Text style={[ss.cardTitle, { color: g.text }]}>Punctuality (Last 3 Months)</Text>
            <View style={ss.rateRow}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 26, fontWeight: '900', color: punctuality.punctualityRate >= 80 ? g.mint : punctuality.punctualityRate >= 60 ? g.accent : g.coral }}>
                  {punctuality.punctualityRate != null ? `${punctuality.punctualityRate}%` : '—'}
                </Text>
                <Text style={[{ fontSize: 11, marginTop: 4, color: g.textMuted, fontWeight: '600' }]}>On Time</Text>
              </View>
              <View style={[ss.rateDivider, { backgroundColor: g.border }]} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '900', color: g.coral }}>{punctuality.lateCount}</Text>
                <Text style={[{ fontSize: 11, marginTop: 4, color: g.textMuted, fontWeight: '600' }]}>Late Days</Text>
              </View>
              <View style={[ss.rateDivider, { backgroundColor: g.border }]} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '900', color: g.accent }}>
                  {punctuality.avgLateMinutes > 0 ? `${punctuality.avgLateMinutes}m` : '—'}
                </Text>
                <Text style={[{ fontSize: 11, marginTop: 4, color: g.textMuted, fontWeight: '600' }]}>Avg Late</Text>
              </View>
              <View style={[ss.rateDivider, { backgroundColor: g.border }]} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '900', color: g.textMuted }}>{punctuality.earlyCheckoutCount}</Text>
                <Text style={[{ fontSize: 11, marginTop: 4, color: g.textMuted, fontWeight: '600' }]}>Early Out</Text>
              </View>
            </View>
          </LinearGradient>
        )}

        {/* Stats grid */}
        <View style={ss.grid}>
          {summaryStats.map((s, i) => (
            <StatCard key={s.label} label={s.label} value={s.value} color={s.color} anim={statAnims[i]} g={g} grad={grad} />
          ))}
        </View>

        {/* All-time card */}
        {allTime && (
          <LinearGradient colors={grad.card} style={[ss.allTimeCard, { borderColor: g.border }]}>
            <View style={ss.cardHeaderRow}>
              <Text style={[ss.cardTitle, { color: g.text }]}>All-Time (This Year)</Text>
              <View style={[ss.badge, { backgroundColor: g.accentSoft }]}>
                <Text style={{ color: g.accent, fontSize: 10, fontWeight: '700' }}>YTD</Text>
              </View>
            </View>
            <Text style={[ss.bigNum, { color: g.text }]}>{fmtFull(totalTimeSeconds)}</Text>
            <View style={ss.allTimeRow}>
              <View style={ss.allTimeItem}>
                <Text style={[ss.allTimeVal, { color: g.mint }]}>{allTime.presentDays}</Text>
                <Text style={[ss.allTimeLbl, { color: g.textDim }]}>Days Present</Text>
              </View>
              <View style={ss.allTimeItem}>
                <Text style={[ss.allTimeVal, { color: g.accent }]}>{allTime.totalHours}h</Text>
                <Text style={[ss.allTimeLbl, { color: g.textDim }]}>Total Hours</Text>
              </View>
              <View style={ss.allTimeItem}>
                <Text style={[ss.allTimeVal, { color: g.coral }]}>{allTime.avgHoursPerDay}h</Text>
                <Text style={[ss.allTimeLbl, { color: g.textDim }]}>Avg / Day</Text>
              </View>
            </View>
          </LinearGradient>
        )}

        {/* Recent sessions */}
        <Text style={[ss.sectionTitle, { color: g.text }]}>Recent Sessions</Text>
        {sessions.slice(0, 8).length === 0 ? (
          <LinearGradient colors={grad.card} style={[ss.emptyCard, { borderColor: g.border }]}>
            <Text style={{ fontSize: 28, marginBottom: 8 }}>📋</Text>
            <Text style={[{ fontSize: 14, color: g.textMuted }]}>No sessions yet — start checking in</Text>
          </LinearGradient>
        ) : (
          <View style={ss.sessionsList}>
            {sessions.slice(0, 8).map((s, i) => (
              <LinearGradient key={s.id || i} colors={grad.card} style={[ss.sessionRow, { borderColor: g.border }]}>
                <View style={ss.sessionLeft}>
                  <Text style={[ss.sessionDate, { color: g.text }]}>
                    {s.date === todayStr ? 'Today' : new Date(s.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                  <Text style={[ss.sessionTime, { color: g.textDim }]}>
                    {s.checkInTime ? new Date(s.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    {' → '}
                    {s.checkOutTime ? new Date(s.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                  </Text>
                </View>
                <View style={[ss.durBadge, { backgroundColor: g.mintSoft }]}>
                  <Text style={[ss.durText, { color: g.mint }]}>{fmtSec(s.duration || 0)}</Text>
                </View>
              </LinearGradient>
            ))}
          </View>
        )}

        <View style={{ height: 50 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const ss = StyleSheet.create({
  fill:    { flex: 1 },
  scroll:  { flex: 1 },
  inner:   { padding: 20, paddingTop: 56 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },

  header:   { marginBottom: 20 },
  title:    { fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 4 },

  errorBanner: { borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1 },
  errorText:   { fontSize: 13 },

  // Rate card
  rateCard:   { borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1 },
  cardTitle:  { fontSize: 16, fontWeight: '800', marginBottom: 16 },
  rateRow:    { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  rateDivider: { width: 1, height: 60 },
  momRow:     { marginTop: 14, alignItems: 'center' },
  momText:    { fontSize: 13, fontWeight: '700' },
  rateCaption: { fontSize: 11, textAlign: 'center', marginTop: 6 },

  // Trend card
  trendCard:  { borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  legendRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot:        { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 10, fontWeight: '600' },
  trendBars:  { flexDirection: 'row', alignItems: 'flex-end', height: 100 },

  // Stats grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  statCard: { borderRadius: 16, padding: 14, borderWidth: 1, alignItems: 'center', minWidth: '45%' },
  statVal:  { fontSize: 19, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statLbl:  { fontSize: 12, marginTop: 3, fontWeight: '600' },

  // All-time card
  allTimeCard:  { borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1 },
  badge:        { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
  bigNum:       { fontSize: 30, fontWeight: '900', marginTop: 10, fontVariant: ['tabular-nums'] },
  allTimeRow:   { flexDirection: 'row', marginTop: 16, justifyContent: 'space-between' },
  allTimeItem:  { alignItems: 'center', flex: 1 },
  allTimeVal:   { fontSize: 18, fontWeight: '900' },
  allTimeLbl:   { fontSize: 11, marginTop: 3 },

  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  emptyCard:    { borderRadius: 16, padding: 28, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed' },

  sessionsList: { gap: 8, marginBottom: 8 },
  sessionRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, borderWidth: 1 },
  sessionLeft:  { flex: 1 },
  sessionDate:  { fontSize: 14, fontWeight: '700' },
  sessionTime:  { fontSize: 12, marginTop: 2 },
  durBadge:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  durText:      { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
