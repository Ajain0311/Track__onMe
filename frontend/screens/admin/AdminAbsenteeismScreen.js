// screens/admin/AdminAbsenteeismScreen.js — Chronic absenteeism report

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../../store/themeStore';
import { adminGetAbsenteeism, getApiErrorMessage } from '../../services/api';
import { useToast } from '../../components/ToastProvider';

const PERIODS = [
  { label: '7d',  days: 7 },
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
];

function RateBar({ rate, color, g }) {
  return (
    <View style={[rb.wrap, { backgroundColor: g.glass }]}>
      <View style={[rb.fill, { width: `${Math.min(rate, 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

function SummaryStrip({ summary, g, grad }) {
  const items = [
    { label: 'Employees', value: summary.totalEmployees, color: g.text },
    { label: 'Chronic',   value: summary.chronicCount,   color: '#e5534b' },
    { label: 'Chronic %', value: `${summary.chronicRate}%`, color: '#ffb347' },
    { label: 'Avg Rate',  value: `${summary.avgAttendanceRate}%`, color: g.mint },
  ];
  return (
    <View style={ss.strip}>
      {items.map((item) => (
        <LinearGradient key={item.label} colors={grad.card} style={[ss.stripCard, { borderColor: g.border }]}>
          <Text style={[ss.stripVal, { color: item.color }]}>{item.value}</Text>
          <Text style={[ss.stripLabel, { color: g.textMuted }]}>{item.label}</Text>
        </LinearGradient>
      ))}
    </View>
  );
}

export default function AdminAbsenteeismScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData]       = useState(null);
  const [days, setDays]       = useState(30);
  const [threshold, setThreshold] = useState(70);
  const [thresholdInput, setThresholdInput] = useState('70');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminGetAbsenteeism(days, threshold);
      setData(res.data);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [days, threshold]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const applyThreshold = () => {
    const n = parseInt(thresholdInput, 10);
    if (!isNaN(n) && n >= 10 && n <= 100) setThreshold(n);
    else toast.error('Threshold must be 10–100');
  };

  const rateColor = (rate) => {
    if (rate < 50) return '#e5534b';
    if (rate < 70) return '#ffb347';
    return g.mint;
  };

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={{ fontSize: 22, color: g.text }}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: g.text }]}>Absenteeism Report</Text>
      </View>

      {/* Period + threshold controls */}
      <View style={s.controls}>
        <View style={s.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity key={p.days} onPress={() => setDays(p.days)}
              style={[s.periodBtn, { backgroundColor: days === p.days ? g.accent : g.glass, borderColor: days === p.days ? g.accent : g.border }]}>
              <Text style={{ color: days === p.days ? '#fff' : g.textMuted, fontWeight: '700', fontSize: 12 }}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.threshRow}>
          <Text style={[s.threshLabel, { color: g.textMuted }]}>Chronic if below</Text>
          <TextInput
            style={[s.threshInput, { backgroundColor: g.glass, borderColor: g.border, color: g.text }]}
            value={thresholdInput}
            onChangeText={setThresholdInput}
            keyboardType="numeric"
            maxLength={3}
            onBlur={applyThreshold}
            onSubmitEditing={applyThreshold}
          />
          <Text style={[s.threshLabel, { color: g.textMuted }]}>%</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={g.accent} /></View>
      ) : data ? (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

          <SummaryStrip summary={data.summary} g={g} grad={grad} />

          {/* Dept breakdown */}
          {data.deptBreakdown.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: g.textMuted }]}>DEPARTMENT BREAKDOWN</Text>
              {data.deptBreakdown.map((dept) => (
                <LinearGradient key={dept.name} colors={grad.card}
                  style={[s.deptCard, { borderColor: dept.color ? dept.color + '55' : g.border, borderLeftWidth: 4, borderLeftColor: dept.color || g.border }]}>
                  <View style={s.deptHeader}>
                    <Text style={[s.deptName, { color: g.text }]}>{dept.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                      <Text style={{ color: g.textMuted, fontSize: 12 }}>{dept.chronic} chronic</Text>
                      <Text style={[s.deptRate, { color: rateColor(dept.avgRate) }]}>{dept.avgRate}%</Text>
                    </View>
                  </View>
                  <RateBar rate={dept.avgRate} color={rateColor(dept.avgRate)} g={g} />
                  <Text style={[s.deptSub, { color: g.textDim }]}>
                    {dept.total} employees · {dept.chronicRate}% chronically absent
                  </Text>
                </LinearGradient>
              ))}
            </View>
          )}

          {/* Chronic employees list */}
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: g.textMuted }]}>
              CHRONICALLY ABSENT ({data.chronic.length})
            </Text>
            {data.chronic.length === 0 ? (
              <View style={s.empty}>
                <Text style={{ fontSize: 36 }}>🎉</Text>
                <Text style={[s.emptyText, { color: g.textMuted }]}>No chronic absentees in this period!</Text>
              </View>
            ) : (
              data.chronic.map((emp) => (
                <LinearGradient key={emp.userId} colors={grad.card}
                  style={[s.empCard, { borderColor: g.border }]}>
                  <View style={[s.empAvatar, { backgroundColor: g.errorBg }]}>
                    <Text style={{ color: '#e5534b', fontWeight: '900', fontSize: 15 }}>
                      {(emp.displayName || emp.email || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.empName, { color: g.text }]} numberOfLines={1}>
                      {emp.displayName || emp.email}
                    </Text>
                    <Text style={[s.empMeta, { color: g.textMuted }]} numberOfLines={1}>
                      {[emp.designation, emp.department].filter(Boolean).join(' · ') || emp.email}
                    </Text>
                    <RateBar rate={emp.rate} color={rateColor(emp.rate)} g={g} />
                  </View>
                  <View style={s.empStats}>
                    <Text style={[s.empRate, { color: rateColor(emp.rate) }]}>{emp.rate}%</Text>
                    <Text style={[s.empDays, { color: g.textDim }]}>
                      {emp.presentDays}/{emp.totalWorkdays}d
                    </Text>
                  </View>
                </LinearGradient>
              ))
            )}
          </View>

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

  controls:  { paddingHorizontal: 20, gap: 10, marginBottom: 4 },
  periodRow: { flexDirection: 'row', gap: 8 },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  threshRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  threshLabel: { fontSize: 13, fontWeight: '600' },
  threshInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 15, width: 56, textAlign: 'center' },

  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, gap: 0 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },

  strip:      { flexDirection: 'row', gap: 8, marginBottom: 20 },
  stripCard:  { flex: 1, borderRadius: 14, padding: 12, borderWidth: 1, alignItems: 'center' },
  stripVal:   { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  stripLabel: { fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'center' },

  deptCard:   { borderRadius: 16, padding: 14, borderWidth: 1, marginBottom: 10, gap: 6 },
  deptHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deptName:   { fontSize: 14, fontWeight: '800' },
  deptRate:   { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  deptSub:    { fontSize: 11 },

  empCard:   { borderRadius: 14, padding: 12, borderWidth: 1, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  empAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  empName:   { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  empMeta:   { fontSize: 11, marginBottom: 5 },
  empStats:  { alignItems: 'flex-end', gap: 2 },
  empRate:   { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  empDays:   { fontSize: 11 },

  empty:     { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },
});

const rb = StyleSheet.create({
  wrap: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});

const ss = StyleSheet.create({
  strip:     { flexDirection: 'row', gap: 8, marginBottom: 20 },
  stripCard: { flex: 1, borderRadius: 14, padding: 12, borderWidth: 1, alignItems: 'center' },
  stripVal:  { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  stripLabel:{ fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'center' },
});
