// screens/admin/AdminAnomaliesScreen.js — Attendance anomaly detection report

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../../store/themeStore';
import { adminGetAnomalies, getApiErrorMessage } from '../../services/api';
import { useToast } from '../../components/ToastProvider';

const PERIODS = [{ label: '7d', days: 7 }, { label: '30d', days: 30 }, { label: '60d', days: 60 }, { label: '90d', days: 90 }];

const SEVERITY_COLOR = { high: '#e5534b', medium: '#ffb347', low: '#8b7cff' };
const SEVERITY_BG    = { high: 'rgba(229,83,75,0.12)', medium: 'rgba(255,179,71,0.12)', low: 'rgba(139,124,255,0.12)' };
const TYPE_EMOJI = {
  short_session:    '⏱',
  unusual_hour:     '🌙',
  weekend_checkin:  '📅',
  holiday_checkin:  '🎉',
  exact_time_repeat:'🔁',
  rapid_recheckin:  '⚡',
};
const TYPE_LABEL = {
  short_session:    'Short Session',
  unusual_hour:     'Unusual Hour',
  weekend_checkin:  'Weekend Check-in',
  holiday_checkin:  'Holiday Check-in',
  exact_time_repeat:'Robotic Timing',
  rapid_recheckin:  'Rapid Re-check-in',
};

const ALL_TYPES = Object.keys(TYPE_LABEL);

export default function AdminAnomaliesScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData]       = useState(null);
  const [days, setDays]       = useState(30);
  const [filter, setFilter]   = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminGetAnomalies(days);
      setData(res.data);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const displayed = data
    ? (filter === 'all' ? data.anomalies : data.anomalies.filter((a) => a.severity === filter || a.type === filter))
    : [];

  const formatTime = (iso) => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={{ fontSize: 22, color: g.text }}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: g.text }]}>Anomaly Detection</Text>
      </View>

      {/* Period selector */}
      <View style={s.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity key={p.days} onPress={() => setDays(p.days)}
            style={[s.periodBtn, { backgroundColor: days === p.days ? g.accent : g.glass, borderColor: days === p.days ? g.accent : g.border }]}>
            <Text style={{ color: days === p.days ? '#fff' : g.textMuted, fontWeight: '700', fontSize: 12 }}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={g.accent} /></View>
      ) : data ? (
        <>
          {/* Summary strip */}
          <View style={s.strip}>
            {[
              { label: 'Total',   value: data.summary.total,       color: g.text },
              { label: 'High',    value: data.summary.highCount,   color: SEVERITY_COLOR.high },
              { label: 'Medium',  value: data.summary.mediumCount, color: SEVERITY_COLOR.medium },
              { label: 'Users',   value: data.summary.uniqueUsers, color: g.accent },
            ].map((item) => (
              <LinearGradient key={item.label} colors={grad.card} style={[s.stripCard, { borderColor: g.border }]}>
                <Text style={[s.stripVal, { color: item.color }]}>{item.value}</Text>
                <Text style={[s.stripLabel, { color: g.textMuted }]}>{item.label}</Text>
              </LinearGradient>
            ))}
          </View>

          {/* Severity filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll}
            contentContainerStyle={s.filterContent}>
            {['all', 'high', 'medium', 'low'].map((f) => (
              <TouchableOpacity key={f} onPress={() => setFilter(f)}
                style={[s.filterBtn, {
                  backgroundColor: filter === f ? (SEVERITY_COLOR[f] || g.accent) : g.glass,
                  borderColor:     filter === f ? (SEVERITY_COLOR[f] || g.accent) : g.border,
                }]}>
                <Text style={{ color: filter === f ? '#fff' : g.textMuted, fontWeight: '700', fontSize: 12, textTransform: 'capitalize' }}>
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {displayed.length === 0 ? (
              <View style={s.empty}>
                <Text style={{ fontSize: 40 }}>✅</Text>
                <Text style={[s.emptyText, { color: g.textMuted }]}>No anomalies detected in this period.</Text>
              </View>
            ) : (
              displayed.map((a, i) => (
                <LinearGradient key={`${a.sessionId || a.type}-${i}`} colors={grad.card}
                  style={[s.card, { borderColor: SEVERITY_COLOR[a.severity] + '55', borderLeftWidth: 4, borderLeftColor: SEVERITY_COLOR[a.severity] }]}>
                  <View style={[s.typeIcon, { backgroundColor: SEVERITY_BG[a.severity] }]}>
                    <Text style={{ fontSize: 18 }}>{TYPE_EMOJI[a.type] || '⚠️'}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[s.typeLabel, { color: g.text }]}>{TYPE_LABEL[a.type] || a.type}</Text>
                      <View style={[s.severityChip, { backgroundColor: SEVERITY_COLOR[a.severity] + '22', borderColor: SEVERITY_COLOR[a.severity] + '66' }]}>
                        <Text style={{ color: SEVERITY_COLOR[a.severity], fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>{a.severity}</Text>
                      </View>
                    </View>
                    <Text style={[s.user, { color: g.textMuted }]} numberOfLines={1}>
                      {a.name || a.email}{a.dept ? ` · ${a.dept}` : ''}
                    </Text>
                    <Text style={[s.detail, { color: g.textDim }]}>{a.detail}</Text>
                    {a.checkInTime && (
                      <Text style={[s.time, { color: g.textDim }]}>{formatTime(a.checkInTime)}</Text>
                    )}
                  </View>
                </LinearGradient>
              ))
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </>
      ) : null}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill:     { flex: 1 },
  topBar:   { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  backBtn:  { width: 40, height: 40, justifyContent: 'center' },
  title:    { flex: 1, fontSize: 22, fontWeight: '900' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  periodRow:   { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 12 },
  periodBtn:   { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },

  strip:     { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 10 },
  stripCard: { flex: 1, borderRadius: 14, padding: 10, borderWidth: 1, alignItems: 'center' },
  stripVal:  { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  stripLabel:{ fontSize: 10, fontWeight: '600', marginTop: 2 },

  filterScroll:  { maxHeight: 42 },
  filterContent: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  filterBtn:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },

  content:  { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, gap: 8 },
  card:     { borderRadius: 14, padding: 12, borderWidth: 1, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  typeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  typeLabel:{ fontSize: 13, fontWeight: '800' },
  severityChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  user:     { fontSize: 12 },
  detail:   { fontSize: 12 },
  time:     { fontSize: 11, marginTop: 2 },

  empty:     { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },
});
