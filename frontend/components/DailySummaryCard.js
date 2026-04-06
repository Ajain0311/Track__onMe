// components/DailySummaryCard.js — one row per calendar day with total hours + expandable sessions

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

const formatHM = (totalMinutes) => {
  const m = Math.max(0, Math.round(totalMinutes || 0));
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  return `${h}h ${min.toString().padStart(2, '0')}m`;
};

const formatTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const staticStyles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 6,
  },
  cardGrad: { borderRadius: 20 },
  cardInner: { padding: 18 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  dateLabel: { fontSize: 17, fontWeight: '800' },
  iso: { fontSize: 11, marginTop: 4, letterSpacing: 0.5 },
  totalBlock: { alignItems: 'flex-end' },
  totalValue: {
    fontSize: 26,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  totalHint: { fontSize: 11, marginTop: 2, textTransform: 'uppercase' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '600' },
  pillLive: {},
  pillLiveText: { fontSize: 11, fontWeight: '700' },
  chev: { marginLeft: 'auto', fontSize: 12, paddingHorizontal: 4 },
  sessions: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  sessionRow: { flexDirection: 'row', alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, marginRight: 12 },
  dotDone: {},
  dotOpen: {},
  sessionMain: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionTimes: { fontSize: 13, fontWeight: '600' },
  sessionDur: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

export default function DailySummaryCard({ day }) {
  const [open, setOpen] = useState(false);
  const { colors: g, gradients: grad } = useThemeStore();

  const toggle = () => {
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setOpen((o) => !o);
  };

  const { date, totalMinutes, sessionCount, hasOpenSession, sessions } = day;

  return (
    <View style={[staticStyles.wrap, { borderColor: g.border, shadowColor: g.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20 }]}>
      <LinearGradient colors={grad.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={staticStyles.cardGrad}>
        <TouchableOpacity activeOpacity={0.92} onPress={toggle} style={staticStyles.cardInner}>
          <View style={staticStyles.top}>
            <View>
              <Text style={[staticStyles.dateLabel, { color: g.text }]}>{formatDate(date)}</Text>
              <Text style={[staticStyles.iso, { color: g.textDim }]}>{date}</Text>
            </View>
            <View style={staticStyles.totalBlock}>
              <Text style={[staticStyles.totalValue, { color: g.mint }]}>{formatHM(totalMinutes)}</Text>
              <Text style={[staticStyles.totalHint, { color: g.textDim }]}>total</Text>
            </View>
          </View>

          <View style={staticStyles.metaRow}>
            <View style={[staticStyles.pill, { backgroundColor: g.glass, borderColor: g.border }]}>
              <Text style={[staticStyles.pillText, { color: g.textMuted }]}>
                {sessionCount} session{sessionCount !== 1 ? 's' : ''}
              </Text>
            </View>
            {hasOpenSession ? (
              <View style={[staticStyles.pill, staticStyles.pillLive, { backgroundColor: g.mintSoft, borderColor: 'rgba(62,232,199,0.35)' }]}>
                <Text style={[staticStyles.pillLiveText, { color: g.mint }]}>● includes active</Text>
              </View>
            ) : null}
            <Text style={[staticStyles.chev, { color: g.textDim }]}>{open ? '▲' : '▼'}</Text>
          </View>

          {open ? (
            <View style={[staticStyles.sessions, { borderTopColor: g.border }]}>
              {sessions.map((s) => {
                const done = s.checkOutTime != null;
                return (
                  <View key={s.id} style={staticStyles.sessionRow}>
                    <View style={[staticStyles.dot, { backgroundColor: done ? g.accent : g.mint }]} />
                    <View style={staticStyles.sessionMain}>
                      <Text style={[staticStyles.sessionTimes, { color: g.textMuted }]}>
                        {formatTime(s.checkInTime)} → {done ? formatTime(s.checkOutTime) : '…'}
                      </Text>
                      <Text style={[staticStyles.sessionDur, { color: g.text }]}>
                        {done && s.totalDuration != null
                          ? formatHM(s.totalDuration)
                          : 'In progress'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}
