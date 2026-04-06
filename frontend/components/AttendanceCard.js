// components/AttendanceCard.js
// A single attendance record card for the History screen.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Format ISO time string to HH:mm
const formatTime = (iso) => {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Format YYYY-MM-DD to a readable date
const formatDate = (dateStr) => {
  if (!dateStr) return 'Unknown Date';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

// Format minutes into "Xh Ym"
const formatDuration = (minutes) => {
  if (minutes == null) return 'In Progress';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
};

export default function AttendanceCard({ record, index }) {
  const isComplete = record.checkOutTime !== null;

  return (
    <View style={[styles.card, { opacity: isComplete ? 1 : 0.85 }]}>
      {/* Left accent bar */}
      <View style={[styles.accentBar, isComplete ? styles.accentComplete : styles.accentActive]} />

      <View style={styles.content}>
        {/* Date Row */}
        <View style={styles.topRow}>
          <Text style={styles.date}>{formatDate(record.date)}</Text>
          <View style={[styles.badge, isComplete ? styles.badgeComplete : styles.badgeActive]}>
            <Text style={[styles.badgeText, isComplete ? styles.badgeTextComplete : styles.badgeTextActive]}>
              {isComplete ? 'Complete' : 'Active'}
            </Text>
          </View>
        </View>

        {/* Time Row */}
        <View style={styles.timeRow}>
          <View style={styles.timeBlock}>
            <Text style={styles.timeLabel}>Check In</Text>
            <Text style={styles.timeValue}>{formatTime(record.checkInTime)}</Text>
          </View>

          <View style={styles.arrow}>
            <Text style={styles.arrowText}>→</Text>
          </View>

          <View style={styles.timeBlock}>
            <Text style={styles.timeLabel}>Check Out</Text>
            <Text style={[styles.timeValue, !isComplete && styles.timeValueMuted]}>
              {isComplete ? formatTime(record.checkOutTime) : '--:--'}
            </Text>
          </View>

          <View style={styles.durationBlock}>
            <Text style={styles.durationLabel}>Duration</Text>
            <Text style={[styles.durationValue, !isComplete && styles.durationActive]}>
              {formatDuration(record.totalDuration)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  accentBar: { width: 4 },
  accentComplete: { backgroundColor: '#6c63ff' },
  accentActive: { backgroundColor: '#2ecc71' },

  content: { flex: 1, padding: 16 },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  date: { color: '#ddd', fontSize: 14, fontWeight: '700' },

  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  badgeComplete: { backgroundColor: '#1e1a42' },
  badgeActive: { backgroundColor: '#0d2e1a' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextComplete: { color: '#6c63ff' },
  badgeTextActive: { color: '#2ecc71' },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeBlock: { flex: 1 },
  timeLabel: { color: '#555', fontSize: 11, marginBottom: 2, fontWeight: '600' },
  timeValue: { color: '#fff', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  timeValueMuted: { color: '#444' },

  arrow: { paddingHorizontal: 4 },
  arrowText: { color: '#444', fontSize: 16 },

  durationBlock: { alignItems: 'flex-end' },
  durationLabel: { color: '#555', fontSize: 11, marginBottom: 2, fontWeight: '600' },
  durationValue: { color: '#6c63ff', fontSize: 16, fontWeight: '700' },
  durationActive: { color: '#2ecc71' },
});
