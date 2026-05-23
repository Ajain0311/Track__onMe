// screens/MyLocationRequestsScreen.js
// User sees their location requests history + status badges.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Platform, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import { getMyLocationRequests, cancelLocationRequest, getApiErrorMessage } from '../services/api';
import Toast from '../components/Toast';

const statusConfig = {
  pending:  { label: 'Pending',  emoji: '⏳', color: '#ffb347' },
  approved: { label: 'Approved', emoji: '✅', color: '#3ee8c7' },
  rejected: { label: 'Rejected', emoji: '❌', color: '#ff7b9c' },
};

const fmtDate = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function MyLocationRequestsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') =>
    setToast({ visible: true, message, type });

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await getMyLocationRequests();
      setRequests(res.data.requests || []);
    } catch (e) {
      showToast(getApiErrorMessage(e), 'error');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleCancel = (item) => {
    const doCancel = async () => {
      try {
        await cancelLocationRequest(item.id);
        showToast('Request cancelled.', 'success');
        load();
      } catch (e) {
        showToast(getApiErrorMessage(e), 'error');
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Cancel this location request?')) doCancel();
    } else {
      Alert.alert('Cancel Request', `Cancel the request for "${item.name}"?`, [
        { text: 'No', style: 'cancel' },
        { text: 'Cancel Request', style: 'destructive', onPress: doCancel },
      ]);
    }
  };

  const renderItem = ({ item }) => {
    const cfg = statusConfig[item.status] || statusConfig.pending;
    return (
      <LinearGradient colors={grad.card} style={[st.card, { borderColor: g.border }]}>
        <View style={[st.statusBar, { backgroundColor: cfg.color }]} />
        <View style={{ flex: 1, padding: 14 }}>
          <View style={st.row}>
            <Text style={[st.name, { color: g.text }]} numberOfLines={1}>{item.name}</Text>
            <View style={[st.badge, { backgroundColor: cfg.color + '22', borderColor: cfg.color }]}>
              <Text style={{ color: cfg.color, fontSize: 11, fontWeight: '800' }}>
                {cfg.emoji} {cfg.label}
              </Text>
            </View>
          </View>

          {item.address ? (
            <Text style={[st.addr, { color: g.textMuted }]} numberOfLines={1}>{item.address}</Text>
          ) : null}

          <Text style={{ color: g.textDim, fontSize: 11, marginTop: 4 }}>
            📍 {item.latitude?.toFixed(5)}, {item.longitude?.toFixed(5)} · ⭕ {item.radiusMeters}m
          </Text>

          {item.notes ? (
            <Text style={{ color: g.textMuted, fontSize: 12, marginTop: 4, fontStyle: 'italic' }} numberOfLines={2}>
              "{item.notes}"
            </Text>
          ) : null}

          <View style={[st.divider, { backgroundColor: g.border }]} />

          {item.status === 'pending' ? (
            <View style={st.footer}>
              <Text style={{ color: g.textDim, fontSize: 11 }}>
                Submitted {fmtDate(item.createdAt)}
              </Text>
              <TouchableOpacity
                onPress={() => handleCancel(item)}
                style={[st.cancelChip, { borderColor: g.coral }]}
              >
                <Text style={{ color: g.coral, fontSize: 11, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={st.footer}>
              <Text style={{ color: g.textDim, fontSize: 11 }}>
                {item.status === 'approved' ? '✅ Approved' : '❌ Rejected'} {fmtDate(item.reviewedAt)}
              </Text>
              {item.adminNote ? (
                <Text style={{ color: g.textMuted, fontSize: 11, fontStyle: 'italic', marginLeft: 6, flex: 1 }} numberOfLines={1}>
                  — {item.adminNote}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </LinearGradient>
    );
  };

  return (
    <LinearGradient colors={grad.screen} style={st.fill}>
      <Toast
        message={toast.message} type={toast.type} visible={toast.visible}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />

      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.back}>
          <Text style={{ color: g.accent, fontSize: 15, fontWeight: '700' }}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={[st.title, { color: g.text }]}>My Requests</Text>
            <Text style={{ color: g.textMuted, fontSize: 13 }}>Track your location request status</Text>
          </View>
          <TouchableOpacity
            style={[st.newBtn, { backgroundColor: g.accent }]}
            onPress={() => navigation.navigate('LocationRequest')}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color={g.accent} />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={g.accent} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={st.center}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
              <Text style={{ color: g.textMuted, fontSize: 16, textAlign: 'center' }}>
                No requests yet.{'\n'}Tap "+ New" to submit a location.
              </Text>
            </View>
          }
        />
      )}
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 },
  back: { marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '900' },
  list: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { flexDirection: 'row', borderRadius: 16, marginBottom: 10, borderWidth: 1, overflow: 'hidden' },
  statusBar: { width: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  name: { fontSize: 15, fontWeight: '800', flex: 1, marginRight: 8 },
  addr: { fontSize: 12, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, flexShrink: 0 },
  divider: { height: 1, marginVertical: 10 },
  footer: { flexDirection: 'row', alignItems: 'center' },
  cancelChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginLeft: 'auto' },
  newBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
});
