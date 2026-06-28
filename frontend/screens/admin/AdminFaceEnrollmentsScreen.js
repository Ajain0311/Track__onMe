// screens/admin/AdminFaceEnrollmentsScreen.js
// Admin / manager reviews face enrollment submissions: approve or reject.
// A user's face only becomes usable for check-in once approved here.

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  TextInput, Modal, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../../store/themeStore';
import {
  adminGetFaceEnrollments,
  adminApproveFaceEnrollment,
  adminRejectFaceEnrollment,
  getApiErrorMessage,
} from '../../services/api';
import Toast from '../../components/Toast';

const TABS = [
  { key: 'pending',  label: 'Pending',  emoji: '⏳' },
  { key: 'approved', label: 'Approved', emoji: '✅' },
  { key: 'rejected', label: 'Rejected', emoji: '❌' },
];

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export default function AdminFaceEnrollmentsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const [activeTab, setActiveTab] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const [modal, setModal] = useState({ visible: false, item: null, action: null });
  const [adminNote, setAdminNote] = useState('');
  const [acting, setActing] = useState(false);

  const showToast = (message, type = 'success') => setToast({ visible: true, message, type });

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await adminGetFaceEnrollments(activeTab);
      setRequests(res.data.requests || []);
      setPendingCount(res.data.pendingCount || 0);
    } catch (e) {
      showToast(getApiErrorMessage(e), 'error');
    } finally { setLoading(false); setRefreshing(false); }
  }, [activeTab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openModal = (item, action) => { setModal({ visible: true, item, action }); setAdminNote(''); };
  const closeModal = () => setModal({ visible: false, item: null, action: null });

  const handleAction = async () => {
    if (!modal.item) return;
    setActing(true);
    try {
      if (modal.action === 'approve') {
        await adminApproveFaceEnrollment(modal.item.id, adminNote || null);
        showToast('Face enrollment approved — the user can now check in.', 'success');
      } else {
        await adminRejectFaceEnrollment(modal.item.id, adminNote || null);
        showToast('Face enrollment rejected.', 'success');
      }
      closeModal();
      load();
    } catch (e) {
      showToast(getApiErrorMessage(e), 'error');
    } finally { setActing(false); }
  };

  const renderItem = ({ item }) => (
    <LinearGradient colors={grad.card} style={[st.card, { borderColor: g.border }]}>
      <View style={[st.bar, {
        backgroundColor: item.status === 'pending' ? '#ffb347' : item.status === 'approved' ? '#3ee8c7' : g.coral,
      }]} />
      <View style={{ flex: 1, padding: 14 }}>
        <View style={st.rowBetween}>
          <View style={[st.avatar, { backgroundColor: g.accentSoft }]}>
            <Text style={{ color: g.accent, fontSize: 13, fontWeight: '900' }}>
              {(item.userEmail || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ color: g.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
              {item.userEmail || 'Unknown user'}
            </Text>
            <Text style={{ color: g.textDim, fontSize: 11 }}>Submitted {fmtDate(item.createdAt)}</Text>
          </View>
        </View>

        <Text style={{ color: g.textDim, fontSize: 11, marginTop: 8 }}>
          🧬 {item.model || 'embedding'} · {item.sampleCount || 0} shot(s)
        </Text>
        {item.quality ? (
          <Text style={{ color: g.textDim, fontSize: 11, marginTop: 2 }}>
            ☀ brightness {item.quality.brightness} · 🔎 sharpness {item.quality.sharpness}
            {item.quality.faceRatio != null ? ` · face ${(item.quality.faceRatio * 100).toFixed(1)}%` : ''}
          </Text>
        ) : null}

        {item.status === 'pending' ? (
          <View style={st.actions}>
            <TouchableOpacity
              style={[st.actionBtn, { backgroundColor: 'rgba(62,232,199,0.12)', borderColor: '#3ee8c7' }]}
              onPress={() => openModal(item, 'approve')}>
              <Text style={{ color: '#3ee8c7', fontWeight: '800', fontSize: 13 }}>✓ Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.actionBtn, { backgroundColor: 'rgba(255,123,156,0.12)', borderColor: g.coral }]}
              onPress={() => openModal(item, 'reject')}>
              <Text style={{ color: g.coral, fontWeight: '800', fontSize: 13 }}>✕ Reject</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[st.reviewedRow, { borderTopColor: g.border }]}>
            <Text style={{ color: g.textDim, fontSize: 11 }}>
              {item.status === 'approved' ? '✅ Approved' : '❌ Rejected'} {fmtDate(item.reviewedAt)}
            </Text>
            {item.adminNote ? (
              <Text style={{ color: g.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 2 }}>
                Note: {item.adminNote}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </LinearGradient>
  );

  return (
    <LinearGradient colors={grad.screen} style={st.fill}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible}
        onHide={() => setToast((t) => ({ ...t, visible: false }))} />

      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.back}>
          <Text style={{ color: g.accent, fontSize: 15, fontWeight: '700' }}>← Back</Text>
        </TouchableOpacity>
        <View style={st.rowBetween}>
          <Text style={[st.title, { color: g.text }]}>Face Enrollments</Text>
          {pendingCount > 0 && (
            <View style={[st.badge, { backgroundColor: '#ffb347' }]}>
              <Text style={{ color: '#000', fontSize: 12, fontWeight: '900' }}>{pendingCount} pending</Text>
            </View>
          )}
        </View>
        <Text style={{ color: g.textMuted, fontSize: 13, marginTop: 2 }}>
          Approve a user's face before they can check in with face verification
        </Text>
      </View>

      <View style={[st.tabs, { borderBottomColor: g.border }]}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key}
            style={[st.tab, activeTab === t.key && { borderBottomColor: g.accent, borderBottomWidth: 2.5 }]}
            onPress={() => setActiveTab(t.key)}>
            <Text style={{ fontSize: 14, fontWeight: activeTab === t.key ? '800' : '600', color: activeTab === t.key ? g.accent : g.textMuted }}>
              {t.emoji} {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color={g.accent} /></View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          contentContainerStyle={st.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={g.accent} />}
          ListEmptyComponent={
            <View style={st.center}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>
                {activeTab === 'pending' ? '⏳' : activeTab === 'approved' ? '✅' : '❌'}
              </Text>
              <Text style={{ color: g.textMuted, fontSize: 15, textAlign: 'center' }}>No {activeTab} enrollments</Text>
            </View>
          }
        />
      )}

      <Modal visible={modal.visible} transparent animationType="slide">
        <View style={st.overlay}>
          <LinearGradient colors={grad.card} style={[st.modal, { borderColor: g.border }]}>
            <Text style={[st.modalTitle, { color: g.text }]}>
              {modal.action === 'approve' ? '✅ Approve Face' : '❌ Reject Face'}
            </Text>
            {modal.item && (
              <Text style={{ color: g.textMuted, fontSize: 13, marginBottom: 12 }}>
                User: <Text style={{ fontWeight: '700', color: g.text }}>{modal.item.userEmail}</Text>
              </Text>
            )}
            <Text style={{ color: g.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
              {modal.action === 'approve' ? 'APPROVAL NOTE (OPTIONAL)' : 'REJECTION REASON (OPTIONAL)'}
            </Text>
            <TextInput
              style={[st.noteInput, { backgroundColor: g.glass, borderColor: g.border, color: g.text }]}
              placeholder={modal.action === 'approve' ? 'e.g. Verified identity' : 'e.g. Blurry / not the right person'}
              placeholderTextColor={g.textDim}
              value={adminNote} onChangeText={setAdminNote} multiline
            />
            <View style={st.modalBtns}>
              <TouchableOpacity style={[st.modalBtn, { borderColor: g.border }]} onPress={closeModal} disabled={acting}>
                <Text style={{ color: g.textMuted, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.modalBtn, { backgroundColor: modal.action === 'approve' ? '#3ee8c7' : g.coral, borderColor: 'transparent' }]}
                onPress={handleAction} disabled={acting}>
                {acting ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: modal.action === 'approve' ? '#000' : '#fff', fontWeight: '800' }}>
                      {modal.action === 'approve' ? 'Approve' : 'Reject'}
                    </Text>}
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 },
  back: { marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '900' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  list: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  card: { flexDirection: 'row', borderRadius: 16, marginBottom: 10, borderWidth: 1, overflow: 'hidden' },
  bar: { width: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', borderWidth: 1 },
  reviewedRow: { borderTopWidth: 1, marginTop: 10, paddingTop: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, borderWidth: 1 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 16 },
  noteInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, height: 80, textAlignVertical: 'top', marginBottom: 16 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
});
