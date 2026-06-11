// screens/admin/AdminEmployeeDetailScreen.js — Full employee profile for admins/managers

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../../store/themeStore';
import {
  adminGetUserAttendance, adminGetUserLeaveBalance, getApiErrorMessage,
} from '../../services/api';
import ScreenHeader from '../../components/ScreenHeader';

const pad2 = (n) => String(n).padStart(2, '0');
const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = (iso) =>
  iso ? new Date(iso + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
const fmtDur = (secs) => {
  if (!secs || secs <= 0) return '—';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${pad2(m)}m` : `${m}m`;
};

function Avatar({ name, email, color, size = 60, g }) {
  const initials = (name || email || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const bg = color ? `${color}22` : g.accentSoft;
  const fg = color || g.accent;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: bg, borderWidth: 2, borderColor: fg,
      justifyContent: 'center', alignItems: 'center',
    }}>
      <Text style={{ color: fg, fontSize: size * 0.35, fontWeight: '900' }}>{initials}</Text>
    </View>
  );
}

function InfoRow({ label, value, g }) {
  if (!value) return null;
  return (
    <View style={[st.infoRow, { borderBottomColor: g.border }]}>
      <Text style={[st.infoLabel, { color: g.textMuted }]}>{label}</Text>
      <Text style={[st.infoValue, { color: g.text }]}>{value}</Text>
    </View>
  );
}

function StatBox({ label, value, color, g }) {
  return (
    <View style={[st.statBox, { backgroundColor: g.glass }]}>
      <Text style={[st.statVal, { color }]}>{value ?? '—'}</Text>
      <Text style={[st.statLbl, { color: g.textMuted }]}>{label}</Text>
    </View>
  );
}

export default function AdminEmployeeDetailScreen({ navigation, route }) {
  const { profile } = route.params;
  const { colors: g, gradients: grad } = useThemeStore();

  const [attendance, setAttendance] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const year = new Date().getFullYear();
      const [attRes, leavRes] = await Promise.allSettled([
        adminGetUserAttendance(profile.userId),
        adminGetUserLeaveBalance(profile.userId, year),
      ]);
      if (attRes.status === 'fulfilled') {
        setAttendance(attRes.value.data.records || []);
      }
      if (leavRes.status === 'fulfilled') {
        setLeaveBalance(leavRes.value.data.balance || []);
      }
      if (attRes.status === 'rejected') {
        setError(getApiErrorMessage(attRes.reason));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile.userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Derive stats from attendance records
  const todayStr = new Date().toISOString().split('T')[0];
  const recent30 = attendance.filter((r) => {
    const rDate = (r.checkInTime || r.date || '').slice(0, 10);
    const diff = (new Date(todayStr) - new Date(rDate)) / 86400000;
    return diff >= 0 && diff < 30;
  });

  const isActiveNow    = attendance.some((r) => !r.checkOutTime);
  const checkedToday   = attendance.some((r) => (r.checkInTime || '').slice(0, 10) === todayStr);
  const daysThisMonth  = new Set(recent30.map((r) => (r.checkInTime || r.date || '').slice(0, 10))).size;
  const totalHours30   = Math.round(recent30.reduce((s, r) => s + (r.totalDuration || 0), 0) / 3600 * 10) / 10;
  const avgHoursPerDay = daysThisMonth > 0 ? Math.round(totalHours30 / daysThisMonth * 10) / 10 : 0;

  const statusColor = isActiveNow ? g.mint : checkedToday ? g.accent : g.errorBorder;
  const statusLabel = isActiveNow ? 'Active Now' : checkedToday ? 'Checked Out Today' : 'Absent Today';

  const recentRecords = attendance.slice(0, 10);

  const displayName = profile.displayName || profile.email?.split('@')[0] || 'Unknown';

  return (
    <LinearGradient colors={grad.screen} style={st.fill}>
      <ScreenHeader title="Employee Profile" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={st.inner}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={g.accent} />}
      >
        {/* Profile hero */}
        <LinearGradient colors={grad.card} style={[st.heroCard, { borderColor: g.border }]}>
          <View style={st.heroTop}>
            <Avatar
              name={profile.displayName}
              email={profile.email}
              color={profile.departmentColor}
              size={64}
              g={g}
            />
            <View style={{ flex: 1 }}>
              <Text style={[st.heroName, { color: g.text }]} numberOfLines={1}>{displayName}</Text>
              <Text style={[st.heroEmail, { color: g.textMuted }]} numberOfLines={1}>{profile.email}</Text>
              <View style={st.badgeRow}>
                <View style={[st.statusBadge, { backgroundColor: `${statusColor}22`, borderColor: statusColor }]}>
                  <View style={[st.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>{statusLabel}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Details */}
          <View style={[st.detailsBlock, { borderTopColor: g.border }]}>
            <InfoRow label="Designation"  value={profile.designation}     g={g} />
            <InfoRow label="Department"   value={profile.departmentName}   g={g} />
            <InfoRow label="Employee ID"  value={profile.employeeId}       g={g} />
            <InfoRow label="Phone"        value={profile.phone}            g={g} />
          </View>
        </LinearGradient>

        {/* Attendance stats */}
        <Text style={[st.sectionTitle, { color: g.textMuted }]}>LAST 30 DAYS</Text>
        <View style={st.statsRow}>
          <StatBox label="Days Present" value={daysThisMonth}     color={g.mint}  g={g} />
          <StatBox label="Total Hours"  value={`${totalHours30}h`}  color={g.accent} g={g} />
          <StatBox label="Avg/Day"      value={`${avgHoursPerDay}h`} color={g.coral} g={g} />
        </View>

        {/* Leave balance */}
        {leaveBalance.length > 0 && (
          <>
            <Text style={[st.sectionTitle, { color: g.textMuted }]}>LEAVE BALANCE</Text>
            <LinearGradient colors={grad.card} style={[st.leaveCard, { borderColor: g.border }]}>
              {leaveBalance.filter((b) => b.totalDays > 0).map((b, i) => (
                <View key={b.id || i}>
                  {i > 0 && <View style={[st.divider, { backgroundColor: g.border }]} />}
                  <View style={st.leaveRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.leaveName, { color: g.text }]}>{b.name || 'Leave'}</Text>
                      <View style={[st.leaveBar, { backgroundColor: g.glass }]}>
                        <View style={[st.leaveBarFill, {
                          backgroundColor: b.color || g.accent,
                          width: b.totalDays > 0
                            ? `${Math.min(100, (b.usedDays / b.totalDays) * 100)}%`
                            : '0%',
                        }]} />
                      </View>
                    </View>
                    <View style={st.leaveNums}>
                      <Text style={[st.leaveUsed, { color: b.color || g.accent }]}>{b.usedDays}</Text>
                      <Text style={[st.leaveOf, { color: g.textMuted }]}>/{b.totalDays}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </LinearGradient>
          </>
        )}

        {/* Recent attendance */}
        <Text style={[st.sectionTitle, { color: g.textMuted }]}>RECENT ATTENDANCE</Text>
        {loading ? (
          <View style={st.center}><ActivityIndicator color={g.accent} /></View>
        ) : error ? (
          <View style={[st.errorBox, { backgroundColor: g.errorBg, borderColor: g.errorBorder }]}>
            <Text style={{ color: g.coral, fontSize: 13 }}>{error}</Text>
          </View>
        ) : recentRecords.length === 0 ? (
          <LinearGradient colors={grad.card} style={[st.emptyCard, { borderColor: g.border }]}>
            <Text style={{ fontSize: 24, marginBottom: 6 }}>📋</Text>
            <Text style={{ color: g.textMuted, fontSize: 13 }}>No attendance records found.</Text>
          </LinearGradient>
        ) : (
          <LinearGradient colors={grad.card} style={[st.attCard, { borderColor: g.border }]}>
            {recentRecords.map((r, i) => {
              const date = (r.checkInTime || r.date || '').slice(0, 10);
              const isActive = !r.checkOutTime;
              return (
                <View key={r.id || i}>
                  {i > 0 && <View style={[st.divider, { backgroundColor: g.border }]} />}
                  <View style={st.attRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.attDate, { color: g.text }]}>
                        {date === todayStr ? 'Today' : fmtDate(date)}
                      </Text>
                      <Text style={[st.attTimes, { color: g.textDim }]}>
                        {fmtTime(r.checkInTime)} → {isActive ? 'Active' : fmtTime(r.checkOutTime)}
                      </Text>
                    </View>
                    <View style={[st.durBadge, { backgroundColor: isActive ? g.mintSoft : g.glass }]}>
                      <Text style={[st.durText, { color: isActive ? g.mint : g.textMuted }]}>
                        {isActive ? '● Live' : fmtDur(r.totalDuration)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </LinearGradient>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  fill:  { flex: 1 },
  inner: { padding: 16, paddingBottom: 40 },
  center: { paddingVertical: 24, alignItems: 'center' },

  heroCard:    { borderRadius: 20, borderWidth: 1, padding: 16, marginBottom: 16 },
  heroTop:     { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  heroName:    { fontSize: 17, fontWeight: '900', marginBottom: 2 },
  heroEmail:   { fontSize: 13 },
  badgeRow:    { flexDirection: 'row', gap: 6, marginTop: 7 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  statusDot:   { width: 6, height: 6, borderRadius: 3 },

  detailsBlock: { borderTopWidth: 1, marginTop: 14, paddingTop: 10 },
  infoRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1 },
  infoLabel:    { fontSize: 12, fontWeight: '600' },
  infoValue:    { fontSize: 13, fontWeight: '700', textAlign: 'right', flex: 1, marginLeft: 8 },

  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7, marginBottom: 8, marginTop: 4, marginLeft: 2 },
  statsRow:     { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox:      { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center' },
  statVal:      { fontSize: 18, fontWeight: '900' },
  statLbl:      { fontSize: 11, marginTop: 3, fontWeight: '600' },

  leaveCard:    { borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 16 },
  leaveRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  leaveName:    { fontSize: 13, fontWeight: '700', marginBottom: 5 },
  leaveBar:     { height: 5, borderRadius: 3, overflow: 'hidden' },
  leaveBarFill: { height: '100%', borderRadius: 3 },
  leaveNums:    { flexDirection: 'row', alignItems: 'baseline' },
  leaveUsed:    { fontSize: 16, fontWeight: '900' },
  leaveOf:      { fontSize: 12, fontWeight: '600' },

  attCard:   { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  attRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  attDate:   { fontSize: 13, fontWeight: '700' },
  attTimes:  { fontSize: 12, marginTop: 1 },
  durBadge:  { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  durText:   { fontSize: 12, fontWeight: '800' },

  divider:   { height: 1, marginHorizontal: 12 },
  errorBox:  { borderRadius: 12, padding: 14, borderWidth: 1 },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 28, alignItems: 'center' },
});
