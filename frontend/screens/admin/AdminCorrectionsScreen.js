// screens/admin/AdminCorrectionsScreen.js — Admin correction request dashboard

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../../store/themeStore';
import {
  adminGetCorrections, adminApproveCorrection, adminRejectCorrection, getApiErrorMessage,
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

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

function CorrectionAdminCard({ item, g, grad, onApprove, onReject }) {
  const st = STATUS[item.status] ?? STATUS.pending;
  const isPending = item.status === 'pending';

  return (
    <LinearGradient colors={grad.card} style={[s.card, { borderColor: isPending ? 'rgba(255,179,71,0.35)' : g.border }]}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[s.userEmail, { color: g.accent }]} numberOfLines={1}>
            {item.userEmail || item.userId?.slice(0, 12) + '…'}
          </Text>
          <Text style={[s.cardDate, { color: g.text }]}>
            {item.attendanceDate || fmtDate(item.originalCheckIn)}
          </Text>
        </View>
        <View style={[s.statusTag, { backgroundColor: st.bg, borderColor: st.color }]}>
          <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
        </View>
      </View>

      <View style={s.timesGrid}>
        <View style={s.timesCol}>
          <Text style={[s.timesLabel, { color: g.textMuted }]}>Original</Text>
          <Text style={[s.timesValue, { color: g.text }]}>{fmtDateTime(item.originalCheckIn)}</Text>
          <Text style={[s.timesValue, { color: g.textMuted }]}>→ {fmtDateTime(item.originalCheckOut)}</Text>
        </View>
        <Text style={{ color: g.textDim, fontSize: 18, alignSelf: 'center', marginHorizontal: 6 }}>⟶</Text>
        <View style={s.timesCol}>
          <Text style={[s.timesLabel, { color: g.mint }]}>Proposed</Text>
          <Text style={[s.timesValue, { color: g.mint }]}>{fmtDateTime(item.proposedCheckIn)}</Text>
          <Text style={[s.timesValue, { color: g.textMuted }]}>→ {fmtDateTime(item.proposedCheckOut)}</Text>
        </View>
      </View>

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
            <Text style={{ color: '#3ee8c7', fontWeight: '800', fontSize: 13 }}>✓ Approve & Apply</Text>
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

export default function AdminCorrectionsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();
  const [corrections, setCorrections] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState('pending');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const res = await adminGetCorrections(params);
      setCorrections(res.data.corrections || []);
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
      const note = window.prompt(`${title}\n\nOptional note:`);
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
    promptNote('Approve & Apply Correction?', async (note) => {
      try {
        await adminApproveCorrection(item.id, note);
        toast.success('Correction approved and attendance updated.');
        load();
      } catch (e) {
        toast.error(getApiErrorMessage(e));
      }
    });
  };

  const handleReject = (item) => {
    promptNote('Reject Correction?', async (note) => {
      try {
        await adminRejectCorrection(item.id, note);
        toast.success('Correction rejected.');
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
        title="Correction Requests"
        subtitle={pendingCount > 0 ? `${pendingCount} pending` : undefined}
        onBack={() => navigation.goBack()}
      />

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
          data={corrections}
          keyExtractor={(i) => i.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={g.accent} />}
          ListEmptyComponent={
            <EmptyState
              icon="✏️"
              title="No correction requests"
              description={filterStatus === 'pending' ? 'No pending corrections.' : `No ${filterStatus} requests.`}
            />
          }
          renderItem={({ item }) => (
            <CorrectionAdminCard
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

  filters:    { flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: 1 },
  filterTab:  { paddingHorizontal: 10, paddingVertical: 12, marginRight: 4 },
  filterText: { fontSize: 13, fontWeight: '700' },

  card:      { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  cardTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  userEmail: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  cardDate:  { fontSize: 15, fontWeight: '700' },
  statusTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  statusText:{ fontSize: 12, fontWeight: '700' },

  timesGrid:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  timesCol:   { flex: 1 },
  timesLabel: { fontSize: 10, fontWeight: '800', marginBottom: 4, letterSpacing: 0.5 },
  timesValue: { fontSize: 12, fontWeight: '600', marginBottom: 2 },

  reason:     { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  noteBox:    { borderRadius: 10, padding: 10, marginTop: 4, borderWidth: 1 },
  submittedAt:{ fontSize: 11, marginTop: 6 },

  actions:   { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
});
