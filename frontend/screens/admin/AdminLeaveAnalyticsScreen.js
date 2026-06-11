// screens/admin/AdminLeaveAnalyticsScreen.js — Leave pattern analytics

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../../store/themeStore';
import { adminGetLeaveAnalytics, getApiErrorMessage } from '../../services/api';
import { useToast } from '../../components/ToastProvider';

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

// ── Mini bar chart (monthly trend) ────────────────────────────────────────────
function MonthlyChart({ data, g }) {
  const maxVal = Math.max(...data.map((d) => (d.approved || 0) + (d.pending || 0)), 1);
  return (
    <View style={mc.wrap}>
      {data.map((m) => {
        const total  = (m.approved || 0) + (m.pending || 0);
        const pct    = total / maxVal;
        const appPct = (m.approved || 0) / (total || 1);
        return (
          <View key={m.month} style={mc.col}>
            <View style={mc.barWrap}>
              <View style={[mc.bar, { height: `${Math.max(pct * 100, 3)}%` }]}>
                <View style={[mc.barApproved, { flex: appPct, backgroundColor: '#3ee8c7' }]} />
                <View style={[mc.barPending,  { flex: 1 - appPct, backgroundColor: '#ffb347' }]} />
              </View>
            </View>
            <Text style={[mc.label, { color: g.textDim }]}>{m.month.slice(0, 1)}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Horizontal rate bar ───────────────────────────────────────────────────────
function RateBar({ value, max, color, g }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <View style={[rb.wrap, { backgroundColor: g.glass }]}>
      <View style={[rb.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────
function SummaryStrip({ s, g, grad }) {
  const items = [
    { label: 'Requests',  value: s.total,        color: g.text },
    { label: 'Approved',  value: s.approved,     color: '#3ee8c7' },
    { label: 'Pending',   value: s.pending,      color: '#ffb347' },
    { label: 'Approval %',value: `${s.approvalRate}%`, color: g.accent },
  ];
  return (
    <View style={ss.row}>
      {items.map((item) => (
        <LinearGradient key={item.label} colors={grad.card} style={[ss.card, { borderColor: g.border }]}>
          <Text style={[ss.val, { color: item.color }]}>{item.value}</Text>
          <Text style={[ss.label, { color: g.textMuted }]}>{item.label}</Text>
        </LinearGradient>
      ))}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function AdminLeaveAnalyticsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData]       = useState(null);
  const [year, setYear]       = useState(CURRENT_YEAR);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminGetLeaveAnalytics(year);
      setData(res.data);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [year]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const maxTypeDays = data ? Math.max(...data.typeBreakdown.map((t) => t.days), 1) : 1;
  const maxDeptDays = data ? Math.max(...data.deptBreakdown.map((d) => d.days), 1) : 1;

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      {/* Header */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={{ fontSize: 22, color: g.text }}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: g.text }]}>Leave Analytics</Text>
      </View>

      {/* Year selector */}
      <View style={s.yearRow}>
        {YEARS.map((y) => (
          <TouchableOpacity key={y} onPress={() => setYear(y)}
            style={[s.yearBtn, { backgroundColor: year === y ? g.accent : g.glass, borderColor: year === y ? g.accent : g.border }]}>
            <Text style={{ color: year === y ? '#fff' : g.textMuted, fontWeight: '700', fontSize: 13 }}>{y}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={g.accent} /></View>
      ) : data ? (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

          {/* Summary */}
          <SummaryStrip s={data.summary} g={g} grad={grad} />

          {/* Key stats row */}
          <View style={s.keyRow}>
            <LinearGradient colors={grad.card} style={[s.keyCard, { borderColor: g.border }]}>
              <Text style={[s.keyVal, { color: g.mint }]}>{data.summary.totalDays}</Text>
              <Text style={[s.keyLabel, { color: g.textMuted }]}>Total Days Taken</Text>
            </LinearGradient>
            <LinearGradient colors={grad.card} style={[s.keyCard, { borderColor: g.border }]}>
              <Text style={[s.keyVal, { color: '#ffb347' }]}>{data.summary.avgDuration}d</Text>
              <Text style={[s.keyLabel, { color: g.textMuted }]}>Avg Leave Length</Text>
            </LinearGradient>
            <LinearGradient colors={grad.card} style={[s.keyCard, { borderColor: g.border }]}>
              <Text style={[s.keyVal, { color: g.accent }]}>{data.summary.peakMonth || '—'}</Text>
              <Text style={[s.keyLabel, { color: g.textMuted }]}>Peak Month</Text>
            </LinearGradient>
          </View>

          {/* Monthly trend chart */}
          {data.monthlyTrend.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: g.textMuted }]}>MONTHLY TREND</Text>
              <LinearGradient colors={grad.card} style={[s.chartCard, { borderColor: g.border }]}>
                <MonthlyChart data={data.monthlyTrend} g={g} />
                <View style={s.legend}>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: '#3ee8c7' }]} />
                    <Text style={[s.legendLabel, { color: g.textMuted }]}>Approved</Text>
                  </View>
                  <View style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: '#ffb347' }]} />
                    <Text style={[s.legendLabel, { color: g.textMuted }]}>Pending</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          )}

          {/* Leave type breakdown */}
          {data.typeBreakdown.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: g.textMuted }]}>BY LEAVE TYPE</Text>
              {data.typeBreakdown.map((t) => (
                <LinearGradient key={t.id} colors={grad.card}
                  style={[s.typeCard, { borderColor: t.color ? t.color + '55' : g.border, borderLeftWidth: 4, borderLeftColor: t.color || g.accent }]}>
                  <View style={s.typeHeader}>
                    <Text style={[s.typeName, { color: g.text }]}>{t.name}</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.typeDays, { color: t.color || g.accent }]}>{t.days}d</Text>
                      <Text style={[s.typeCount, { color: g.textMuted }]}>{t.count} requests</Text>
                    </View>
                  </View>
                  <RateBar value={t.days} max={maxTypeDays} color={t.color || g.accent} g={g} />
                  <View style={s.typeStats}>
                    <Text style={[s.typeStat, { color: '#3ee8c7' }]}>✓ {t.approved}</Text>
                    <Text style={[s.typeStat, { color: '#ffb347' }]}>⏳ {t.pending}</Text>
                    <Text style={[s.typeStat, { color: '#e5534b' }]}>✕ {t.rejected}</Text>
                    <Text style={[s.typeStat, { color: g.textDim }]}>
                      {t.isPaid ? '💰 Paid' : '📋 Unpaid'}
                    </Text>
                  </View>
                </LinearGradient>
              ))}
            </View>
          )}

          {/* Department breakdown */}
          {data.deptBreakdown.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: g.textMuted }]}>BY DEPARTMENT</Text>
              {data.deptBreakdown.map((d) => (
                <LinearGradient key={d.id} colors={grad.card}
                  style={[s.deptCard, { borderColor: d.color ? d.color + '44' : g.border }]}>
                  <View style={s.deptHeader}>
                    {d.color && <View style={[s.deptDot, { backgroundColor: d.color }]} />}
                    <Text style={[s.deptName, { color: g.text, flex: 1 }]}>{d.name}</Text>
                    <Text style={[s.deptDays, { color: g.accent }]}>{d.days}d</Text>
                  </View>
                  <RateBar value={d.days} max={maxDeptDays} color={d.color || g.accent} g={g} />
                  <Text style={[s.deptSub, { color: g.textDim }]}>
                    {d.count} requests · {d.uniqueEmployees} employees
                  </Text>
                </LinearGradient>
              ))}
            </View>
          )}

          {/* Top leave takers */}
          {data.topLeaveTakers.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: g.textMuted }]}>TOP LEAVE TAKERS</Text>
              {data.topLeaveTakers.map((u, i) => (
                <LinearGradient key={u.userId} colors={grad.card} style={[s.userCard, { borderColor: g.border }]}>
                  <Text style={[s.rank, { color: g.textDim }]}>#{i + 1}</Text>
                  <Text style={[s.userEmail, { color: g.text, flex: 1 }]} numberOfLines={1}>{u.email}</Text>
                  <Text style={[s.userDays, { color: g.accent }]}>{u.days}d</Text>
                  <Text style={[s.userCount, { color: g.textMuted }]}>{u.count}×</Text>
                </LinearGradient>
              ))}
            </View>
          )}

          {data.summary.total === 0 && (
            <View style={s.empty}>
              <Text style={{ fontSize: 40 }}>🌴</Text>
              <Text style={[s.emptyText, { color: g.textMuted }]}>No leave data for {year} yet.</Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      ) : null}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill:    { flex: 1 },
  topBar:  { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title:   { flex: 1, fontSize: 22, fontWeight: '900' },
  centered:{ flex: 1, justifyContent: 'center', alignItems: 'center' },

  yearRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 12 },
  yearBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },

  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20, gap: 0 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },

  keyRow:  { flexDirection: 'row', gap: 8, marginBottom: 20 },
  keyCard: { flex: 1, borderRadius: 14, padding: 12, borderWidth: 1, alignItems: 'center' },
  keyVal:  { fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
  keyLabel:{ fontSize: 10, fontWeight: '600', marginTop: 3, textAlign: 'center' },

  chartCard: { borderRadius: 16, padding: 16, borderWidth: 1 },
  legend:    { flexDirection: 'row', gap: 16, marginTop: 8 },
  legendItem:{ flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel:{ fontSize: 11, fontWeight: '600' },

  typeCard:   { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 10, gap: 8 },
  typeHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  typeName:   { fontSize: 14, fontWeight: '800', flex: 1 },
  typeDays:   { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  typeCount:  { fontSize: 11 },
  typeStats:  { flexDirection: 'row', gap: 14 },
  typeStat:   { fontSize: 12, fontWeight: '700' },

  deptCard:   { borderRadius: 14, padding: 12, borderWidth: 1, marginBottom: 8, gap: 6 },
  deptHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deptDot:    { width: 10, height: 10, borderRadius: 5 },
  deptName:   { fontSize: 14, fontWeight: '700' },
  deptDays:   { fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  deptSub:    { fontSize: 11 },

  userCard:  { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank:      { fontSize: 12, fontWeight: '700', width: 22 },
  userEmail: { fontSize: 13, fontWeight: '600' },
  userDays:  { fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  userCount: { fontSize: 12, width: 28, textAlign: 'right' },

  empty:     { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14 },
});

// Bar chart styles
const mc = StyleSheet.create({
  wrap:       { flexDirection: 'row', height: 100, alignItems: 'flex-end', gap: 3 },
  col:        { flex: 1, alignItems: 'center' },
  barWrap:    { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar:        { width: '100%', flexDirection: 'column', borderRadius: 3, overflow: 'hidden', minHeight: 3 },
  barApproved:{ minHeight: 2 },
  barPending: { minHeight: 2 },
  label:      { fontSize: 8, fontWeight: '700', marginTop: 3 },
});
const rb = StyleSheet.create({
  wrap: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
const ss = StyleSheet.create({
  row:   { flexDirection: 'row', gap: 8, marginBottom: 12 },
  card:  { flex: 1, borderRadius: 14, padding: 10, borderWidth: 1, alignItems: 'center' },
  val:   { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  label: { fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'center' },
});
