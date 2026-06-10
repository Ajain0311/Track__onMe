// screens/MyLeavesScreen.js — Employee leave history + quick submit

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import { getMyLeaves, cancelLeave, getApiErrorMessage } from '../services/api';
import { useToast } from '../components/ToastProvider';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';

const STATUS = {
  pending:   { label: 'Pending',   color: '#ffb347', bg: 'rgba(255,179,71,0.15)' },
  approved:  { label: 'Approved',  color: '#3ee8c7', bg: 'rgba(62,232,199,0.15)' },
  rejected:  { label: 'Rejected',  color: '#ff7b9c', bg: 'rgba(255,123,156,0.15)' },
  cancelled: { label: 'Cancelled', color: '#9ca3af', bg: 'rgba(156,163,175,0.15)' },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtDateShort = (d) => d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';

function LeaveCard({ item, g, grad, onCancel }) {
  const st = STATUS[item.status] ?? STATUS.pending;
  const multiDay = item.startDate !== item.endDate;

  return (
    <LinearGradient colors={grad.card} style={[s.card, { borderColor: g.border }]}>
      <View style={s.cardTop}>
        <View style={[s.typeTag, { backgroundColor: `${item.leaveTypeColor}22`, borderColor: `${item.leaveTypeColor}55` }]}>
          <Text style={[s.typeText, { color: item.leaveTypeColor || g.accent }]}>{item.leaveTypeName}</Text>
        </View>
        <View style={[s.statusTag, { backgroundColor: st.bg, borderColor: st.color }]}>
          <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
        </View>
      </View>

      <Text style={[s.dateRange, { color: g.text }]}>
        {multiDay ? `${fmtDateShort(item.startDate)} – ${fmtDate(item.endDate)}` : fmtDate(item.startDate)}
      </Text>
      <Text style={[s.days, { color: g.textMuted }]}>
        {item.days} day{item.days !== 1 ? 's' : ''}{item.isPaid === false ? ' · Unpaid' : ''}
      </Text>
      <Text style={[s.reason, { color: g.textMuted }]} numberOfLines={2}>{item.reason}</Text>

      {item.adminNote ? (
        <View style={[s.noteBox, { backgroundColor: g.glass, borderColor: g.border }]}>
          <Text style={{ color: g.textMuted, fontSize: 11, fontWeight: '700' }}>Admin note</Text>
          <Text style={{ color: g.text, fontSize: 12, marginTop: 2 }}>{item.adminNote}</Text>
        </View>
      ) : null}

      <View style={[s.cardFooter, { borderTopColor: g.border }]}>
        <Text style={[s.footerDate, { color: g.textDim }]}>
          Submitted {fmtDate(item.createdAt)}
        </Text>
        {item.status === 'pending' && (
          <TouchableOpacity
            style={[s.cancelBtn, { borderColor: '#ff7b9c' }]}
            onPress={() => onCancel(item)}
          >
            <Text style={{ color: '#ff7b9c', fontSize: 12, fontWeight: '700' }}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
}

export default function MyLeavesScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const res = await getMyLeaves(params);
      setLeaves(res.data.leaves || []);
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [filterStatus]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleCancel = (item) => {
    const doCancel = async () => {
      try {
        await cancelLeave(item.id);
        toast.success('Leave request cancelled.');
        load();
      } catch (e) {
        toast.error(getApiErrorMessage(e));
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Cancel this leave request?')) doCancel();
    } else {
      Alert.alert('Cancel Leave?', 'This action cannot be undone.', [
        { text: 'Keep', style: 'cancel' },
        { text: 'Cancel Request', style: 'destructive', onPress: doCancel },
      ]);
    }
  };

  const FILTERS = ['all', 'pending', 'approved', 'rejected'];

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <ScreenHeader title="My Leaves" onBack={() => navigation.goBack()} />

      {/* Filter tabs */}
      <View style={[s.filters, { borderBottomColor: g.border }]}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilterStatus(f)}
            style={[s.filterTab, filterStatus === f && { borderBottomColor: g.accent, borderBottomWidth: 2 }]}
          >
            <Text style={[s.filterText, { color: filterStatus === f ? g.accent : g.textMuted }]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[s.newBtn, { backgroundColor: g.accent }]}
          onPress={() => navigation.navigate('LeaveRequest')}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={g.accent} size="large" />
        </View>
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
              description={filterStatus === 'all' ? 'Tap "+ New" to submit a leave request.' : `No ${filterStatus} requests.`}
            />
          }
          renderItem={({ item }) => (
            <LeaveCard item={item} g={g} grad={grad} onCancel={handleCancel} />
          )}
        />
      )}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill:       { flex: 1 },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list:       { padding: 16, paddingBottom: 100 },

  filters: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 0,
    borderBottomWidth: 1,
  },
  filterTab: { paddingHorizontal: 10, paddingVertical: 12, marginRight: 4 },
  filterText: { fontSize: 13, fontWeight: '700' },
  newBtn: {
    marginLeft: 'auto', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 10, marginBottom: 6,
  },

  card: {
    borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1,
  },
  cardTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  typeTag:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  typeText:  { fontSize: 12, fontWeight: '800' },
  statusTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  statusText:{ fontSize: 12, fontWeight: '700' },

  dateRange: { fontSize: 17, fontWeight: '800', marginBottom: 2 },
  days:      { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  reason:    { fontSize: 13, lineHeight: 19, marginBottom: 6 },

  noteBox: {
    borderRadius: 10, padding: 10, marginTop: 4,
    borderWidth: 1,
  },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 10, marginTop: 8 },
  footerDate: { fontSize: 11 },
  cancelBtn:  { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
});
