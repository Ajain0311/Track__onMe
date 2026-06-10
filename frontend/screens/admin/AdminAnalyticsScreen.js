// screens/admin/AdminAnalyticsScreen.js — Org-wide workforce analytics

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../../store/themeStore';
import { adminGetAnalytics, getApiErrorMessage } from '../../services/api';

const PERIODS = [
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const formatDate = (ds) => {
  const d = new Date(ds + 'T00:00:00');
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function DailyRateChart({ dailyRates, g }) {
  if (!dailyRates || dailyRates.length === 0) return null;
  const weekdays = dailyRates.filter((d) => !d.isWeekend);
  const maxRate = 100;

  // Only show up to last 21 days to avoid crowding
  const visible = weekdays.slice(-21);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 3 }}>
      {visible.map((d) => {
        const h = Math.max((d.rate / maxRate) * 80, d.rate > 0 ? 3 : 0);
        const barColor = d.rate >= 80 ? g.mint : d.rate >= 50 ? g.accent : g.coral;
        return (
          <View key={d.date} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
            <View style={{ width: '100%', height: Math.max(h, 2), borderRadius: 3, backgroundColor: barColor }} />
            <Text style={{ color: g.textDim, fontSize: 7, marginTop: 2 }}>
              {new Date(d.date + 'T00:00:00').getDate()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function DeptBar({ dept, g }) {
  const pct = Math.min(dept.rate, 100);
  const color = pct >= 80 ? g.mint : pct >= 50 ? g.accent : g.coral;
  return (
    <View style={ss.deptRow}>
      <View style={[ss.deptDot, { backgroundColor: dept.color || g.accent }]} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <View style={ss.deptTop}>
          <Text style={[ss.deptName, { color: g.text }]} numberOfLines={1}>{dept.name}</Text>
          <Text style={[ss.deptRate, { color }]}>{pct}%</Text>
        </View>
        <View style={[ss.deptTrack, { backgroundColor: g.glass }]}>
          <View style={[ss.deptFill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
        <Text style={[ss.deptSub, { color: g.textDim }]}>
          {dept.present}/{dept.total} this week
        </Text>
      </View>
    </View>
  );
}

function TopPerformerRow({ person, rank, g, grad }) {
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
  const medal = rank < 3 ? ['🥇','🥈','🥉'][rank] : null;
  const shortEmail = person.email.split('@')[0];
  return (
    <LinearGradient colors={grad.card} style={[ss.perfCard, { borderColor: g.border }]}>
      <View style={ss.perfLeft}>
        <Text style={{ fontSize: 20 }}>{medal || `#${rank + 1}`}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[ss.perfEmail, { color: g.text }]} numberOfLines={1}>{shortEmail}</Text>
        <Text style={[ss.perfSub, { color: g.textDim }]}>
          {person.days} day{person.days !== 1 ? 's' : ''} · {person.totalHrs}h
        </Text>
      </View>
      <View style={[ss.perfBadge, { backgroundColor: g.mintSoft }]}>
        <Text style={[ss.perfRate, { color: g.mint }]}>{person.rate}%</Text>
      </View>
    </LinearGradient>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function AdminAnalyticsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadData = useCallback(async (days = period) => {
    setError(null);
    try {
      const res = await adminGetAnalytics(days);
      setData(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useFocusEffect(useCallback(() => { setLoading(true); loadData(period); }, [period]));

  const changePeriod = (days) => {
    setPeriod(days);
    setLoading(true);
    loadData(days);
  };

  const summary = data?.summary;
  const dailyRates = data?.dailyRates || [];
  const deptBreakdown = data?.deptBreakdown || [];
  const topPerformers = data?.topPerformers || [];

  if (loading) {
    return (
      <LinearGradient colors={grad.screen} style={ss.fill}>
        <View style={ss.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={ss.backBtn}>
            <Text style={{ fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={[ss.screenTitle, { color: g.text }]}>Workforce Analytics</Text>
        </View>
        <View style={ss.centered}>
          <ActivityIndicator size="large" color={g.accent} />
          <Text style={[{ marginTop: 12, fontSize: 14, color: g.textMuted }]}>Crunching data…</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={grad.screen} style={ss.fill}>
      <View style={ss.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={ss.backBtn}>
          <Text style={{ fontSize: 22, color: g.text }}>←</Text>
        </TouchableOpacity>
        <Text style={[ss.screenTitle, { color: g.text }]}>Workforce Analytics</Text>
        <View style={ss.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.days}
              onPress={() => changePeriod(p.days)}
              style={[ss.periodBtn, { backgroundColor: period === p.days ? g.accent : g.glass, borderColor: period === p.days ? g.accent : g.border }]}
            >
              <Text style={{ color: period === p.days ? '#fff' : g.textMuted, fontSize: 11, fontWeight: '700' }}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={ss.inner}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(period); }} tintColor={g.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <View style={[ss.errBox, { backgroundColor: g.errorBg, borderColor: g.errorBorder }]}>
            <Text style={{ color: g.coral, fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {/* Summary strip */}
        {summary && (
          <View style={ss.summaryStrip}>
            <LinearGradient colors={grad.card} style={[ss.summaryChip, { borderColor: g.border }]}>
              <Text style={[ss.chipVal, { color: g.mint }]}>{summary.todayPresent}</Text>
              <Text style={[ss.chipLbl, { color: g.textDim }]}>Today</Text>
            </LinearGradient>
            <LinearGradient colors={grad.card} style={[ss.summaryChip, { borderColor: g.border }]}>
              <Text style={[ss.chipVal, { color: summary.todayRate >= 80 ? g.mint : summary.todayRate >= 50 ? g.accent : g.coral }]}>
                {summary.todayRate}%
              </Text>
              <Text style={[ss.chipLbl, { color: g.textDim }]}>Today Rate</Text>
            </LinearGradient>
            <LinearGradient colors={grad.card} style={[ss.summaryChip, { borderColor: g.border }]}>
              <Text style={[ss.chipVal, { color: g.accent }]}>{summary.avgRate}%</Text>
              <Text style={[ss.chipLbl, { color: g.textDim }]}>Avg Rate</Text>
            </LinearGradient>
            <LinearGradient colors={grad.card} style={[ss.summaryChip, { borderColor: g.border }]}>
              <Text style={[ss.chipVal, { color: g.text }]}>{summary.totalUsers}</Text>
              <Text style={[ss.chipLbl, { color: g.textDim }]}>Employees</Text>
            </LinearGradient>
          </View>
        )}

        {/* Daily attendance trend */}
        <LinearGradient colors={grad.card} style={[ss.card, { borderColor: g.border }]}>
          <Text style={[ss.cardTitle, { color: g.text }]}>Daily Attendance Rate</Text>
          <Text style={[ss.cardSub, { color: g.textDim }]}>Weekdays, last {period} days</Text>
          <View style={{ marginTop: 14 }}>
            <DailyRateChart dailyRates={dailyRates} g={g} />
          </View>
          <View style={ss.rateLegend}>
            <View style={ss.legItem}><View style={[ss.legDot, { backgroundColor: g.mint }]} /><Text style={[ss.legText, { color: g.textDim }]}>≥80%</Text></View>
            <View style={ss.legItem}><View style={[ss.legDot, { backgroundColor: g.accent }]} /><Text style={[ss.legText, { color: g.textDim }]}>≥50%</Text></View>
            <View style={ss.legItem}><View style={[ss.legDot, { backgroundColor: g.coral }]} /><Text style={[ss.legText, { color: g.textDim }]}>&lt;50%</Text></View>
          </View>
        </LinearGradient>

        {/* Department breakdown */}
        {deptBreakdown.length > 0 && (
          <LinearGradient colors={grad.card} style={[ss.card, { borderColor: g.border }]}>
            <Text style={[ss.cardTitle, { color: g.text }]}>Department Breakdown</Text>
            <Text style={[ss.cardSub, { color: g.textDim }]}>Attendance rate this week</Text>
            <View style={{ marginTop: 16, gap: 16 }}>
              {deptBreakdown.map((d) => <DeptBar key={d.id} dept={d} g={g} />)}
            </View>
          </LinearGradient>
        )}

        {/* Top performers */}
        {topPerformers.length > 0 && (
          <View>
            <Text style={[ss.sectionTitle, { color: g.text }]}>Top Performers</Text>
            <Text style={[ss.sectionSub, { color: g.textDim }]}>Most present in last {period} days</Text>
            <View style={ss.perfList}>
              {topPerformers.map((p, i) => (
                <TopPerformerRow key={p.userId} person={p} rank={i} g={g} grad={grad} />
              ))}
            </View>
          </View>
        )}

        {!data && !error && (
          <View style={ss.emptyBox}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📊</Text>
            <Text style={[{ fontSize: 16, fontWeight: '700', color: g.textMuted }]}>No data yet</Text>
            <Text style={[{ fontSize: 13, color: g.textDim, marginTop: 6, textAlign: 'center' }]}>
              Analytics appear once employees start checking in.
            </Text>
          </View>
        )}

        <View style={{ height: 50 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const ss = StyleSheet.create({
  fill:    { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12, gap: 10,
  },
  backBtn:     { width: 40, height: 40, justifyContent: 'center' },
  screenTitle: { flex: 1, fontSize: 22, fontWeight: '900' },
  periodRow:   { flexDirection: 'row', gap: 6 },
  periodBtn:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },

  inner: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },

  errBox: { borderRadius: 12, padding: 12, borderWidth: 1 },

  summaryStrip: { flexDirection: 'row', gap: 8 },
  summaryChip: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1 },
  chipVal:     { fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },
  chipLbl:     { fontSize: 10, marginTop: 3, fontWeight: '600' },

  card:     { borderRadius: 20, padding: 18, borderWidth: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardSub:   { fontSize: 12, marginTop: 3 },

  rateLegend: { flexDirection: 'row', marginTop: 12, gap: 16 },
  legItem:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legDot:     { width: 8, height: 8, borderRadius: 4 },
  legText:    { fontSize: 11 },

  // Dept bar
  deptRow: { flexDirection: 'row', alignItems: 'center' },
  deptDot: { width: 10, height: 10, borderRadius: 5, marginTop: 2 },
  deptTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  deptName: { fontSize: 13, fontWeight: '700', flex: 1 },
  deptRate: { fontSize: 13, fontWeight: '900' },
  deptTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  deptFill:  { height: '100%', borderRadius: 3 },
  deptSub:   { fontSize: 10, marginTop: 3 },

  // Top performers
  sectionTitle: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  sectionSub:   { fontSize: 12, marginTop: 2, marginBottom: 10 },
  perfList:     { gap: 8 },
  perfCard:     { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, borderWidth: 1 },
  perfLeft:     { width: 32, alignItems: 'center' },
  perfEmail:    { fontSize: 14, fontWeight: '700' },
  perfSub:      { fontSize: 12, marginTop: 2 },
  perfBadge:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  perfRate:     { fontSize: 14, fontWeight: '900' },

  emptyBox: { alignItems: 'center', paddingVertical: 40 },
});
