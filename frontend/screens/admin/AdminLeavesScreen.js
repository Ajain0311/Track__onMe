// screens/admin/AdminLeavesScreen.js — Admin leave approval dashboard

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Platform, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../../store/themeStore';
import {
  adminGetLeaves, adminApproveLeave, adminRejectLeave, getApiErrorMessage,
} from '../../services/api';
import { useToast } from '../../components/ToastProvider';
import ScreenHeader from '../../components/ScreenHeader';
import EmptyState from '../../components/EmptyState';

const STATUS = {
  pending:   { label: 'Pending',   color: '#ffb347', bg: 'rgba(255,179,71,0.15)' },
  approved:  { label: 'Approved',  color: '#3ee8c7', bg: 'rgba(62,232,199,0.15)' },
  rejected:  { label: 'Rejected',  color: '#ff7b9c', bg: 'rgba(255,123,156,0.15)' },
  cancelled: { label: 'Cancelled', color: '#9ca3af', bg: 'rgba(156,163,175,0.15)' },
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtDateShort = (d) =>
  d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';

function LeaveAdminCard({ item, g, grad, onApprove, onReject }) {
  const st = STATUS[item.status] ?? STATUS.pending;
  const multiDay = item.startDate !== item.endDate;
  const isPending = item.status === 'pending';

  return (
    <LinearGradient colors={grad.card} style={[s.card, { borderColor: isPending ? 'rgba(255,179,71,0.35)' : g.border }]}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[s.userEmail, { color: g.accent }]} numberOfLines={1}>
            {item.userEmail || item.userId?.slice(0, 8) + '…'}
          </Text>
          <View style={[s.typeTag, { backgroundColor: `${item.leaveTypeColor}22`, borderColor: `${item.leaveTypeColor}55`, alignSelf: 'flex-start', marginTop: 4 }]}>
            <Text style={[s.typeText, { color: item.leaveTypeColor || g.accent }]}>{item.leaveTypeName}</Text>
          </View>
        </View>
        <View style={[s.statusTag, { backgroundColor: st.bg, borderColor: st.color }]}>
          <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
        </View>
      </View>

      <Text style={[s.dateRange, { color: g.text }]}>
        {multiDay
          ? `${fmtDateShort(item.startDate)} – ${fmtDate(item.endDate)}`
          : fmtDate(item.startDate)}
      </Text>
      <Text style={[s.days, { color: g.textMuted }]}>
        {item.days} day{item.days !== 1 ? 's' : ''}{item.isPaid === false ? ' · Unpaid' : ''}
      </Text>
      <Text style={[s.reason, { color: g.textMuted }]} numberOfLines={3}>{item.reason}</Text>

      {item.adminNote ? (
        <View style={[s.noteBox, { backgroundColor: g.glass, borderColor: g.border }]}>
          <Text style={{ color: g.textMuted, fontSize: 11, fontWeight: '700' }}>Note</Text>
          <Text style={{ color: g.text, fontSize: 12, marginTop: 2 }}>{item.adminNote}</Text>
        </View>
      ) : null}

      <Text style={[s.submittedAt, { color: g.textDim }]}>Submitted {fmtDate(item.createdAt)}</Text>

      {isPending && (
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: 'rgba(62,232,199,0.15)', borderColor: '#3ee8c7' }]}
            onPress={() => onApprove(item)}
          >
            <Text style={{ color: '#3ee8c7', fontWeight: '800', fontSize: 13 }}>✓ Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: 'rgba(255,123,156,0.15)', borderColor: '#ff7b9c' }]}
            onPress={() => onReject(item)}
          >
            <Text style={{ color: '#ff7b9c', fontWeight: '800', fontSize: 13 }}>✗ Reject</Text>
          </TouchableOpacity>
        </View>
      )}
    </LinearGradient>
  );
}

export default function AdminLeavesScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [leaves, setLeaves] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState('pending');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const res = await adminGetLeaves(params);
      setLeaves(res.data.leaves || []);
      setPendingCount(res.data.pendingCount ?? 0);
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [filterStatus]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const promptNote = (title, onConfirm) => {
    if (Platform.OS === 'web') {
      const note = window.prompt(`${title}\n\nOptional note (leave blank to skip):`);
      if (note !== null) onConfirm(note || null);
      return;
    }
    Alert.prompt
      ? Alert.prompt(title, 'Optional admin note:', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', onPress: (note) => onConfirm(note || null) },
        ])
      : Alert.alert(title, 'Proceed?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', onPress: () => onConfirm(null) },
        ]);
  };

  const handleApprove = (item) => {
    promptNote('Approve Leave?', async (note) => {
      try {
        await adminApproveLeave(item.id, note);
        toast.success('Leave approved.');
        load();
      } catch (e) {
        toast.error(getApiErrorMessage(e));
      }
    });
  };

  const handleReject = (item) => {
    promptNote('Reject Leave?', async (note) => {
      try {
        await adminRejectLeave(item.id, note);
        toast.success('Leave rejected.');
        load();
      } catch (e) {
        toast.error(getApiErrorMessage(e));
      }
    });
  };

  const FILTERS = ['pending', 'all', 'approved', 'rejected'];

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <ScreenHeader
        title="Leave Requests"
        subtitle={pendingCount > 0 ? `${pendingCount} pending` : undefined}
        onBack={() => navigation.goBack()}
      />

      {/* Filter row */}
      <View style={[s.filters, { borderBottomColor: g.border }]}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilterStatus(f)}
            style={[s.filterTab, filterStatus === f && { borderBottomColor: g.accent, borderBottomWidth: 2 }]}
          >
            <Text style={[s.filterText, { color: filterStatus === f ? g.accent : g.textMuted }]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={g.accent} size="large" /></View>
      ) : (
        <FlatList
          data={leaves}
          keyExtractor={(i) => i.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={g.accent} />}
          ListEmptyComponent={
            <EmptyState
              icon="🌴"
              title="No leave requests"
              description={filterStatus === 'pending' ? 'No pending requests right now.' : `No ${filterStatus} requests.`}
            />
          }
          renderItem={({ item }) => (
            <LeaveAdminCard
              item={item} g={g} grad={grad}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          )}
        />
      )}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list:   { padding: 16, paddingBottom: 100 },

  filters: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, borderBottomWidth: 1,
  },
  filterTab:  { paddingHorizontal: 10, paddingVertical: 12, marginRight: 4 },
  filterText: { fontSize: 13, fontWeight: '700' },

  card: {
    borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1,
  },
  cardTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  userEmail: { fontSize: 14, fontWeight: '800' },
  typeTag:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  typeText:  { fontSize: 11, fontWeight: '800' },
  statusTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  statusText:{ fontSize: 12, fontWeight: '700' },

  dateRange: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  days:      { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  reason:    { fontSize: 13, lineHeight: 19, marginBottom: 6 },

  noteBox: { borderRadius: 10, padding: 10, marginTop: 4, borderWidth: 1 },
  submittedAt: { fontSize: 11, marginTop: 6 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
    alignItems: 'center',
  },
});
