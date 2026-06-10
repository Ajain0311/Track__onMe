// screens/LeaveBalanceScreen.js — Leave balance overview for the current user

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../store/themeStore';
import { getLeaveBalance, getApiErrorMessage } from '../services/api';
import { useToast } from '../components/ToastProvider';
import ScreenHeader from '../components/ScreenHeader';

const CURRENT_YEAR = new Date().getFullYear();

function BalanceCard({ item, g, grad, onRequestLeave }) {
  const pct = item.totalDays > 0
    ? Math.min(1, (item.usedDays + item.pendingDays) / item.totalDays)
    : 0;
  const usedPct    = item.totalDays > 0 ? Math.min(1, item.usedDays / item.totalDays) : 0;
  const pendingPct = item.totalDays > 0 ? Math.min(1, item.pendingDays / item.totalDays) : 0;

  const isUnlimited = item.totalDays === 0 && !item.isPaid;

  return (
    <LinearGradient colors={grad.card} style={[s.card, { borderColor: g.border }]}>
      {/* Header row */}
      <View style={s.cardHeader}>
        <View style={[s.typeTag, { backgroundColor: `${item.color}22`, borderColor: item.color }]}>
          <Text style={[s.typeTagTxt, { color: item.color }]}>{item.name}</Text>
        </View>
        {!isUnlimited && (
          <View style={s.remainingBox}>
            <Text style={[s.remainingNum, { color: item.remaining > 0 ? item.color : g.textMuted }]}>
              {item.remaining}
            </Text>
            <Text style={[s.remainingLabel, { color: g.textMuted }]}>days left</Text>
          </View>
        )}
        {isUnlimited && (
          <View style={[s.unlimitedBadge, { backgroundColor: `${item.color}22`, borderColor: item.color }]}>
            <Text style={[s.unlimitedTxt, { color: item.color }]}>Unpaid</Text>
          </View>
        )}
      </View>

      {/* Description */}
      {!!item.description && (
        <Text style={[s.desc, { color: g.textMuted }]}>{item.description}</Text>
      )}

      {/* Progress bar (only for types with annual allocation) */}
      {!isUnlimited && item.totalDays > 0 && (
        <>
          <View style={[s.progressBg, { backgroundColor: g.glass }]}>
            {/* Used portion */}
            <View
              style={[
                s.progressFill,
                { width: `${usedPct * 100}%`, backgroundColor: item.color, borderRadius: 4 },
              ]}
            />
            {/* Pending portion */}
            {pendingPct > 0 && (
              <View
                style={[
                  s.progressFill,
                  s.pendingFill,
                  {
                    width: `${pendingPct * 100}%`,
                    backgroundColor: `${item.color}66`,
                    left: `${usedPct * 100}%`,
                  },
                ]}
              />
            )}
          </View>

          {/* Stats row */}
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <View style={[s.statDot, { backgroundColor: item.color }]} />
              <Text style={[s.statTxt, { color: g.text }]}>{item.usedDays} used</Text>
            </View>
            {item.pendingDays > 0 && (
              <View style={s.statItem}>
                <View style={[s.statDot, { backgroundColor: `${item.color}66` }]} />
                <Text style={[s.statTxt, { color: g.textMuted }]}>{item.pendingDays} pending</Text>
              </View>
            )}
            <View style={[s.statItem, { marginLeft: 'auto' }]}>
              <Text style={[s.statTxt, { color: g.textMuted }]}>/ {item.totalDays} total</Text>
            </View>
          </View>
        </>
      )}

      {/* Zero allocation notice */}
      {!isUnlimited && item.totalDays === 0 && (
        <Text style={[s.noAlloc, { color: g.textMuted }]}>
          No allocation set for this year. Contact your admin.
        </Text>
      )}

      {/* Request leave CTA */}
      <TouchableOpacity
        onPress={() => onRequestLeave(item)}
        style={[s.requestBtn, { borderColor: item.color, backgroundColor: `${item.color}15` }]}
        activeOpacity={0.8}
      >
        <Text style={[s.requestBtnTxt, { color: item.color }]}>+ Request {item.name}</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

export default function LeaveBalanceScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [balance, setBalance]     = useState([]);
  const [year, setYear]           = useState(CURRENT_YEAR);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((y = year, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    getLeaveBalance(y)
      .then((r) => setBalance(r.data.balance || []))
      .catch((e) => toast.error(getApiErrorMessage(e)))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [year]);

  useFocusEffect(useCallback(() => { load(year); }, [year]));

  const switchYear = (delta) => {
    const y = year + delta;
    setYear(y);
    load(y);
  };

  const handleRequestLeave = (leaveType) => {
    navigation.navigate('LeaveRequest', { preselectedTypeId: leaveType.id });
  };

  const totalUsed    = balance.reduce((s, b) => s + b.usedDays, 0);
  const totalPending = balance.reduce((s, b) => s + b.pendingDays, 0);
  const totalLeft    = balance.filter((b) => b.totalDays > 0).reduce((s, b) => s + b.remaining, 0);

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <ScreenHeader title="Leave Balance" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={s.inner}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(year, true); }} tintColor={g.accent} />}
      >
        {/* Year selector */}
        <View style={s.yearRow}>
          <TouchableOpacity onPress={() => switchYear(-1)} style={[s.yearBtn, { borderColor: g.border, backgroundColor: g.glass }]}>
            <Text style={{ color: g.text, fontSize: 18 }}>‹</Text>
          </TouchableOpacity>
          <Text style={[s.yearTxt, { color: g.text }]}>{year}</Text>
          <TouchableOpacity
            onPress={() => switchYear(1)}
            style={[s.yearBtn, { borderColor: g.border, backgroundColor: g.glass }]}
            disabled={year >= CURRENT_YEAR}
          >
            <Text style={{ color: year >= CURRENT_YEAR ? g.textDim : g.text, fontSize: 18 }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Summary strip */}
        {!loading && balance.length > 0 && (
          <LinearGradient colors={grad.card} style={[s.summary, { borderColor: g.border }]}>
            <View style={s.summaryItem}>
              <Text style={[s.summaryNum, { color: g.accent }]}>{totalLeft}</Text>
              <Text style={[s.summaryLabel, { color: g.textMuted }]}>Days Left</Text>
            </View>
            <View style={[s.summaryDivider, { backgroundColor: g.border }]} />
            <View style={s.summaryItem}>
              <Text style={[s.summaryNum, { color: g.mint }]}>{totalUsed}</Text>
              <Text style={[s.summaryLabel, { color: g.textMuted }]}>Days Used</Text>
            </View>
            <View style={[s.summaryDivider, { backgroundColor: g.border }]} />
            <View style={s.summaryItem}>
              <Text style={[s.summaryNum, { color: '#ffb347' }]}>{totalPending}</Text>
              <Text style={[s.summaryLabel, { color: g.textMuted }]}>Pending</Text>
            </View>
          </LinearGradient>
        )}

        {loading ? (
          <View style={s.center}><ActivityIndicator color={g.accent} size="large" /></View>
        ) : balance.length === 0 ? (
          <View style={[s.emptyBox, { backgroundColor: g.glass, borderColor: g.border }]}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>📋</Text>
            <Text style={{ color: g.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>No leave data</Text>
            <Text style={{ color: g.textMuted, textAlign: 'center', fontSize: 13 }}>No leave types configured. Ask your admin.</Text>
          </View>
        ) : (
          balance.map((item) => (
            <BalanceCard
              key={item.id}
              item={item}
              g={g}
              grad={grad}
              onRequestLeave={handleRequestLeave}
            />
          ))
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill:  { flex: 1 },
  inner: { padding: 20, paddingBottom: 100 },
  center: { height: 200, justifyContent: 'center', alignItems: 'center' },

  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 },
  yearBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  yearTxt: { fontSize: 20, fontWeight: '900', minWidth: 60, textAlign: 'center' },

  summary:      { flexDirection: 'row', borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 20 },
  summaryItem:  { flex: 1, alignItems: 'center' },
  summaryNum:   { fontSize: 24, fontWeight: '900' },
  summaryLabel: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  summaryDivider: { width: 1, alignSelf: 'stretch' },

  card:       { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  typeTag:    { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  typeTagTxt: { fontSize: 13, fontWeight: '800' },
  remainingBox:   { alignItems: 'flex-end' },
  remainingNum:   { fontSize: 26, fontWeight: '900', lineHeight: 28 },
  remainingLabel: { fontSize: 10, fontWeight: '700', marginTop: 1 },
  unlimitedBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  unlimitedTxt:   { fontSize: 12, fontWeight: '700' },

  desc: { fontSize: 13, marginBottom: 12 },

  progressBg: { height: 8, borderRadius: 4, overflow: 'hidden', position: 'relative', marginBottom: 10 },
  progressFill: { position: 'absolute', top: 0, left: 0, height: '100%' },
  pendingFill:  { borderRadius: 4 },

  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statDot:  { width: 8, height: 8, borderRadius: 4 },
  statTxt:  { fontSize: 12, fontWeight: '600' },

  noAlloc:    { fontSize: 12, fontStyle: 'italic', marginBottom: 12 },
  requestBtn: { borderRadius: 10, borderWidth: 1, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  requestBtnTxt: { fontSize: 13, fontWeight: '800' },

  emptyBox: { borderRadius: 16, padding: 32, borderWidth: 1, alignItems: 'center', marginTop: 20 },
});
