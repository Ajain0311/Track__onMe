// components/AttendanceCard.js — Theme-aware attendance record card

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';

const formatTime = (iso) => {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'Unknown Date';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
};

const formatDuration = (minutes) => {
  if (minutes == null) return 'In Progress';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
};

export default function AttendanceCard({ record }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const isComplete = record.checkOutTime !== null;

  return (
    <LinearGradient
      colors={grad.card}
      style={[styles.card, { borderColor: g.border }]}
    >
      <View style={[styles.accentBar, { backgroundColor: isComplete ? g.accent : g.mint }]} />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.date, { color: g.text }]}>{formatDate(record.date)}</Text>
          <View style={[styles.badge, { backgroundColor: isComplete ? g.accentSoft : g.mintSoft }]}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: isComplete ? g.accent : g.mint }}>
              {isComplete ? 'Complete' : 'Active'}
            </Text>
          </View>
        </View>
        <View style={styles.timeRow}>
          <View style={styles.timeBlock}>
            <Text style={[styles.timeLabel, { color: g.textMuted }]}>Check In</Text>
            <Text style={[styles.timeValue, { color: g.text }]}>{formatTime(record.checkInTime)}</Text>
          </View>
          <Text style={[styles.arrow, { color: g.textDim }]}>→</Text>
          <View style={styles.timeBlock}>
            <Text style={[styles.timeLabel, { color: g.textMuted }]}>Check Out</Text>
            <Text style={[styles.timeValue, { color: isComplete ? g.text : g.textDim }]}>
              {isComplete ? formatTime(record.checkOutTime) : '--:--'}
            </Text>
          </View>
          <View style={styles.durationBlock}>
            <Text style={[styles.timeLabel, { color: g.textMuted }]}>Duration</Text>
            <Text style={[styles.timeValue, { color: isComplete ? g.accent : g.mint }]}>
              {formatDuration(record.totalDuration)}
            </Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  accentBar: { width: 4 },
  content: { flex: 1, padding: 16 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  date: { fontSize: 14, fontWeight: '700' },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeBlock: { flex: 1 },
  timeLabel: { fontSize: 11, marginBottom: 2, fontWeight: '600' },
  timeValue: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  arrow: { fontSize: 16, paddingHorizontal: 2 },
  durationBlock: { alignItems: 'flex-end' },
});
