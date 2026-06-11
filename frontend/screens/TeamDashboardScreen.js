// screens/TeamDashboardScreen.js — Manager's team attendance view

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../store/themeStore';
import { getManagerTeam, getApiErrorMessage } from '../services/api';
import { useToast } from '../components/ToastProvider';

const pad2 = (n) => String(n).padStart(2, '0');
const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDur = (secs) => {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${pad2(m)}m` : `${m}m`;
};
const initials = (name, email) => {
  if (name) return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (email || '?')[0].toUpperCase();
};

function MemberCard({ member, g, grad }) {
  const { today, week } = member;
  const name = member.displayName || member.email.split('@')[0];
  const statusColor = today.checkedIn ? g.mint : today.present ? g.accent : g.errorBorder;
  const statusLabel = today.checkedIn ? 'Active' : today.present ? 'Checked Out' : 'Absent';

  return (
    <LinearGradient colors={grad.card} style={[ss.memberCard, { borderColor: g.border }]}>
      {/* Left: avatar */}
      <View style={[ss.avatar, { backgroundColor: statusColor + '33', borderColor: statusColor }]}>
        <Text style={[ss.avatarText, { color: statusColor }]}>{initials(member.displayName, member.email)}</Text>
      </View>

      {/* Middle: info */}
      <View style={ss.memberInfo}>
        <View style={ss.memberTop}>
          <Text style={[ss.memberName, { color: g.text }]} numberOfLines={1}>{name}</Text>
          <View style={[ss.statusBadge, { backgroundColor: statusColor + '22' }]}>
            <View style={[ss.statusDot, { backgroundColor: statusColor, opacity: today.checkedIn ? 1 : 0.7 }]} />
            <Text style={{ color: statusColor, fontSize: 10, fontWeight: '700' }}>{statusLabel}</Text>
          </View>
        </View>
        {member.designation && (
          <Text style={[ss.memberDesig, { color: g.textMuted }]} numberOfLines={1}>{member.designation}</Text>
        )}
        {/* Today's time */}
        {today.present && (
          <Text style={[ss.memberTimes, { color: g.textDim }]}>
            {fmtTime(today.checkInTime)}
            {today.checkOutTime ? ` → ${fmtTime(today.checkOutTime)}` : ' → Active'}
            {today.duration > 0 ? `  ${fmtDur(today.duration)}` : ''}
          </Text>
        )}
        {/* Week bar */}
        <View style={ss.weekBarRow}>
          <View style={[ss.weekTrack, { backgroundColor: g.glass }]}>
            <View style={[ss.weekFill, {
              width: `${week.rate}%`,
              backgroundColor: week.rate >= 80 ? g.mint : week.rate >= 50 ? g.accent : g.coral,
            }]} />
          </View>
          <Text style={[ss.weekText, { color: g.textDim }]}>
            {week.daysPresent}/{week.daysTotal}w
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

export default function TeamDashboardScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef(null);

  const loadData = useCallback(async (silent = false) => {
    try {
      const res = await getManagerTeam();
      setData(res.data);
    } catch (err) {
      if (!silent) toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
    // Auto-refresh every 30 seconds
    pollRef.current = setInterval(() => loadData(true), 30_000);
    return () => clearInterval(pollRef.current);
  }, [loadData]));

  const department = data?.department;
  const members    = data?.members || [];
  const summary    = data?.summary;
  const deptColor  = department?.color || g.accent;

  if (loading) {
    return (
      <LinearGradient colors={grad.screen} style={ss.fill}>
        <View style={ss.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={ss.backBtn}>
            <Text style={{ fontSize: 22, color: g.text }}>←</Text>
          </TouchableOpacity>
          <Text style={[ss.screenTitle, { color: g.text }]}>My Team</Text>
        </View>
        <View style={ss.centered}>
          <ActivityIndicator size="large" color={g.accent} />
          <Text style={[{ marginTop: 12, color: g.textMuted, fontSize: 14 }]}>Loading team…</Text>
        </View>
      </LinearGradient>
    );
  }

  const presentRate = summary?.total > 0
    ? Math.round((summary.present / summary.total) * 100)
    : 0;

  return (
    <LinearGradient colors={grad.screen} style={ss.fill}>
      {/* Header */}
      <View style={ss.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={ss.backBtn}>
          <Text style={{ fontSize: 22, color: g.text }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[ss.screenTitle, { color: g.text }]}>My Team</Text>
          {department && (
            <View style={ss.deptTag}>
              <View style={[ss.deptDot, { backgroundColor: deptColor }]} />
              <Text style={[ss.deptName, { color: deptColor }]}>{department.name}</Text>
            </View>
          )}
        </View>
        {/* Live pulse */}
        <View style={ss.livePill}>
          <View style={[ss.liveDot, { backgroundColor: g.mint }]} />
          <Text style={{ color: g.mint, fontSize: 10, fontWeight: '700' }}>LIVE</Text>
        </View>
      </View>

      <FlatList
        data={members}
        keyExtractor={(m) => m.userId}
        contentContainerStyle={ss.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={g.accent} />
        }
        ListHeaderComponent={
          <>
            {/* Summary strip */}
            {summary && (
              <View style={ss.summaryRow}>
                <LinearGradient colors={grad.card} style={[ss.summChip, { borderColor: g.border }]}>
                  <Text style={[ss.summVal, { color: g.mint }]}>{summary.present}</Text>
                  <Text style={[ss.summLbl, { color: g.textDim }]}>Present</Text>
                </LinearGradient>
                <LinearGradient colors={grad.card} style={[ss.summChip, { borderColor: g.border }]}>
                  <Text style={[ss.summVal, { color: g.coral }]}>{summary.absent}</Text>
                  <Text style={[ss.summLbl, { color: g.textDim }]}>Absent</Text>
                </LinearGradient>
                <LinearGradient colors={grad.card} style={[ss.summChip, { borderColor: g.border }]}>
                  <Text style={[ss.summVal, {
                    color: presentRate >= 80 ? g.mint : presentRate >= 50 ? g.accent : g.coral,
                  }]}>
                    {presentRate}%
                  </Text>
                  <Text style={[ss.summLbl, { color: g.textDim }]}>Today</Text>
                </LinearGradient>
                <LinearGradient colors={grad.card} style={[ss.summChip, { borderColor: g.border }]}>
                  <Text style={[ss.summVal, { color: g.text }]}>{summary.total}</Text>
                  <Text style={[ss.summLbl, { color: g.textDim }]}>Total</Text>
                </LinearGradient>
              </View>
            )}

            {members.length > 0 && (
              <Text style={[ss.sectionTitle, { color: g.textMuted }]}>
                {members.length} member{members.length !== 1 ? 's' : ''}
              </Text>
            )}
          </>
        }
        renderItem={({ item }) => <MemberCard member={item} g={g} grad={grad} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={ss.emptyBox}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>👥</Text>
            <Text style={[{ fontSize: 16, fontWeight: '700', color: g.textMuted }]}>No team members</Text>
            <Text style={[{ fontSize: 13, color: g.textDim, marginTop: 6, textAlign: 'center' }]}>
              Your department has no employees yet. Ask an admin to set up departments and assign employees.
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </LinearGradient>
  );
}

const ss = StyleSheet.create({
  fill:    { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14, gap: 10,
  },
  backBtn:     { width: 40, height: 40, justifyContent: 'center' },
  screenTitle: { fontSize: 24, fontWeight: '900' },
  deptTag:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  deptDot:     { width: 8, height: 8, borderRadius: 4 },
  deptName:    { fontSize: 12, fontWeight: '700' },
  livePill:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(62,232,199,0.12)' },
  liveDot:     { width: 6, height: 6, borderRadius: 3 },

  listContent: { paddingHorizontal: 20, paddingBottom: 50 },
  summaryRow:  { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summChip:    { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1 },
  summVal:     { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  summLbl:     { fontSize: 10, marginTop: 2, fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  memberCard: { borderRadius: 16, borderWidth: 1, flexDirection: 'row', padding: 14, alignItems: 'center' },
  avatar:     { width: 44, height: 44, borderRadius: 22, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 16, fontWeight: '900' },

  memberInfo:  { flex: 1 },
  memberTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  memberName:  { fontSize: 15, fontWeight: '800', flex: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusDot:   { width: 5, height: 5, borderRadius: 3 },
  memberDesig: { fontSize: 12, marginTop: 2 },
  memberTimes: { fontSize: 11, marginTop: 4, fontVariant: ['tabular-nums'] },
  weekBarRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  weekTrack:   { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  weekFill:    { height: '100%', borderRadius: 2 },
  weekText:    { fontSize: 10, minWidth: 28, fontVariant: ['tabular-nums'] },

  emptyBox: { alignItems: 'center', padding: 40, maxWidth: 280, alignSelf: 'center' },
});
