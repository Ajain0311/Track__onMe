// screens/MyCorrectionRequestsScreen.js — Employee correction history

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import { getMyCorrections, cancelCorrection, getApiErrorMessage } from '../services/api';
import { useToast } from '../components/ToastProvider';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';

const STATUS = {
  pending:   { label: 'Pending',   color: '#ffb347', bg: 'rgba(255,179,71,0.15)' },
  approved:  { label: 'Approved',  color: '#3ee8c7', bg: 'rgba(62,232,199,0.15)' },
  rejected:  { label: 'Rejected',  color: '#ff7b9c', bg: 'rgba(255,123,156,0.15)' },
  cancelled: { label: 'Cancelled', color: '#9ca3af', bg: 'rgba(156,163,175,0.15)' },
};

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

function CorrectionCard({ item, g, grad, onCancel }) {
  const st = STATUS[item.status] ?? STATUS.pending;
  return (
    <LinearGradient colors={grad.card} style={[s.card, { borderColor: item.status === 'pending' ? 'rgba(255,179,71,0.35)' : g.border }]}>
      <View style={s.cardTop}>
        <Text style={[s.cardDate, { color: g.text }]}>
          {item.attendanceDate || fmtDate(item.originalCheckIn)}
        </Text>
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
        <Text style={{ color: g.textDim, fontSize: 20, alignSelf: 'center', marginHorizontal: 8 }}>⟶</Text>
        <View style={s.timesCol}>
          <Text style={[s.timesLabel, { color: g.accent }]}>Proposed</Text>
          <Text style={[s.timesValue, { color: g.accent }]}>{fmtDateTime(item.proposedCheckIn)}</Text>
          <Text style={[s.timesValue, { color: g.textMuted }]}>→ {fmtDateTime(item.proposedCheckOut)}</Text>
        </View>
      </View>

      <Text style={[s.reason, { color: g.textMuted }]} numberOfLines={2}>{item.reason}</Text>

      {item.adminNote ? (
        <View style={[s.noteBox, { backgroundColor: g.glass, borderColor: g.border }]}>
          <Text style={{ color: g.textMuted, fontSize: 11, fontWeight: '700' }}>Admin note</Text>
          <Text style={{ color: g.text, fontSize: 12, marginTop: 2 }}>{item.adminNote}</Text>
        </View>
      ) : null}

      <View style={[s.cardFooter, { borderTopColor: g.border }]}>
        <Text style={[s.footerDate, { color: g.textDim }]}>Submitted {fmtDate(item.createdAt)}</Text>
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

export default function MyCorrectionRequestsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const res = await getMyCorrections(params);
      setCorrections(res.data.corrections || []);
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
        await cancelCorrection(item.id);
        toast.success('Correction request cancelled.');
        load();
      } catch (e) {
        toast.error(getApiErrorMessage(e));
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Cancel this correction request?')) doCancel();
    } else {
      Alert.alert('Cancel Request?', 'This action cannot be undone.', [
        { text: 'Keep', style: 'cancel' },
        { text: 'Cancel Request', style: 'destructive', onPress: doCancel },
      ]);
    }
  };

  const FILTERS = ['all', 'pending', 'approved', 'rejected'];

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <ScreenHeader title="Correction Requests" onBack={() => navigation.goBack()} />

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
              description="Expand a session in History and tap 'Request Correction'."
            />
          }
          renderItem={({ item }) => (
            <CorrectionCard item={item} g={g} grad={grad} onCancel={handleCancel} />
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
  cardTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardDate:  { fontSize: 16, fontWeight: '800' },
  statusTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  statusText:{ fontSize: 12, fontWeight: '700' },

  timesGrid:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  timesCol:   { flex: 1 },
  timesLabel: { fontSize: 10, fontWeight: '800', marginBottom: 4, letterSpacing: 0.5 },
  timesValue: { fontSize: 12, fontWeight: '600', marginBottom: 2 },

  reason:    { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  noteBox:   { borderRadius: 10, padding: 10, marginTop: 4, borderWidth: 1 },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 10, marginTop: 8 },
  footerDate: { fontSize: 11 },
  cancelBtn:  { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
});
