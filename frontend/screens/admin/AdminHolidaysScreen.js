// screens/admin/AdminHolidaysScreen.js — Holiday calendar management

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../../store/themeStore';
import {
  adminGetHolidays, adminCreateHoliday,
  adminUpdateHoliday, adminDeleteHoliday,
  getApiErrorMessage,
} from '../../services/api';
import { useToast } from '../../components/ToastProvider';

const TYPE_LABELS = { public: 'Public', optional: 'Optional', org: 'Company' };
const TYPE_COLORS = { public: '#3ee8c7', optional: '#8b7cff', org: '#ffb347' };
const TYPES = Object.keys(TYPE_LABELS);

const formatDate = (ds) =>
  new Date(ds + 'T12:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

// ── Holiday Form Modal ─────────────────────────────────────────────────────────

function HolidayFormModal({ visible, holiday, onClose, onSaved, g, grad }) {
  const [date, setDate]     = useState(holiday?.date || '');
  const [name, setName]     = useState(holiday?.name || '');
  const [type, setType]     = useState(holiday?.type || 'public');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  React.useEffect(() => {
    if (visible) {
      setDate(holiday?.date || '');
      setName(holiday?.name || '');
      setType(holiday?.type || 'public');
    }
  }, [visible, holiday]);

  const save = async () => {
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) { toast.error('Enter date as YYYY-MM-DD'); return; }
    if (!name.trim()) { toast.error('Holiday name is required'); return; }
    setSaving(true);
    try {
      if (holiday?.id) {
        await adminUpdateHoliday(holiday.id, { date, name: name.trim(), type });
        toast.success('Holiday updated');
      } else {
        await adminCreateHoliday({ date, name: name.trim(), type });
        toast.success('Holiday added');
      }
      onSaved();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [ss.input, { backgroundColor: g.glass, borderColor: g.border, color: g.text }];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={ss.overlay}>
        <LinearGradient colors={grad.card} style={[ss.sheet, { borderColor: g.border }]}>
          <Text style={[ss.sheetTitle, { color: g.text }]}>
            {holiday?.id ? 'Edit Holiday' : 'Add Holiday'}
          </Text>

          <Text style={[ss.label, { color: g.textMuted }]}>Date (YYYY-MM-DD)</Text>
          {Platform.OS === 'web' ? (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...inputStyle, padding: 12, marginBottom: 14, fontFamily: 'inherit' }}
            />
          ) : (
            <TextInput
              style={[inputStyle, { marginBottom: 14 }]}
              value={date}
              onChangeText={setDate}
              placeholder="2026-08-15"
              placeholderTextColor={g.textDim}
              keyboardType="numeric"
            />
          )}

          <Text style={[ss.label, { color: g.textMuted }]}>Holiday Name</Text>
          <TextInput
            style={[inputStyle, { marginBottom: 14 }]}
            value={name}
            onChangeText={setName}
            placeholder="Independence Day"
            placeholderTextColor={g.textDim}
          />

          <Text style={[ss.label, { color: g.textMuted }]}>Type</Text>
          <View style={ss.typeRow}>
            {TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setType(t)}
                style={[ss.typeChip, {
                  backgroundColor: type === t ? TYPE_COLORS[t] + '33' : g.glass,
                  borderColor: type === t ? TYPE_COLORS[t] : g.border,
                }]}
              >
                <Text style={{ color: type === t ? TYPE_COLORS[t] : g.textMuted, fontWeight: '700', fontSize: 13 }}>
                  {TYPE_LABELS[t]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={ss.btnRow}>
            <TouchableOpacity onPress={onClose} style={[ss.btn, { backgroundColor: g.glass, borderColor: g.border }]}>
              <Text style={{ color: g.textMuted, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} disabled={saving} style={[ss.btn, { backgroundColor: g.accent, flex: 1 }]}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '800' }}>{holiday?.id ? 'Save' : 'Add'}</Text>}
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function AdminHolidaysScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget]     = useState(null);
  const toast = useToast();

  const loadHolidays = useCallback(async () => {
    try {
      const res = await adminGetHolidays();
      setHolidays(res.data.holidays || []);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadHolidays(); }, [loadHolidays]));

  const openAdd  = () => { setEditTarget(null); setModalVisible(true); };
  const openEdit = (h) => { setEditTarget(h); setModalVisible(true); };

  const confirmDelete = (h) => {
    const doDelete = async () => {
      try {
        await adminDeleteHoliday(h.id);
        toast.success('Holiday removed');
        loadHolidays();
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove "${h.name}"?`)) doDelete();
    } else {
      Alert.alert('Remove Holiday', `Remove "${h.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // Group by year
  const grouped = {};
  for (const h of holidays) {
    const yr = h.date?.slice(0, 4) || 'Unknown';
    if (!grouped[yr]) grouped[yr] = [];
    grouped[yr].push(h);
  }
  const sections = Object.entries(grouped).sort((a, b) => Number(b[0]) - Number(a[0]));

  const renderHoliday = ({ item: h }) => {
    const typeColor = TYPE_COLORS[h.type] || g.accent;
    return (
      <LinearGradient colors={grad.card} style={[ss.card, { borderColor: g.border }]}>
        <View style={[ss.typeBar, { backgroundColor: typeColor }]} />
        <View style={ss.cardContent}>
          <View style={{ flex: 1 }}>
            <Text style={[ss.hName, { color: g.text }]}>{h.name}</Text>
            <Text style={[ss.hDate, { color: g.textMuted }]}>{formatDate(h.date)}</Text>
            <View style={[ss.typeBadge, { backgroundColor: typeColor + '22', borderColor: typeColor + '55' }]}>
              <Text style={{ color: typeColor, fontSize: 10, fontWeight: '700' }}>
                {TYPE_LABELS[h.type] || h.type}
              </Text>
            </View>
          </View>
          <View style={ss.cardActions}>
            <TouchableOpacity onPress={() => openEdit(h)} style={[ss.iconBtn, { backgroundColor: g.glass }]}>
              <Text style={{ fontSize: 16 }}>✏️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => confirmDelete(h)} style={[ss.iconBtn, { backgroundColor: 'rgba(255,99,99,0.1)' }]}>
              <Text style={{ fontSize: 16 }}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    );
  };

  const listData = [];
  for (const [yr, items] of sections) {
    listData.push({ type: 'header', key: `h-${yr}`, year: yr });
    for (const h of items) listData.push({ type: 'item', key: h.id, ...h });
  }

  return (
    <LinearGradient colors={grad.screen} style={ss.fill}>
      <View style={ss.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={ss.backBtn}>
          <Text style={{ fontSize: 22, color: g.text }}>←</Text>
        </TouchableOpacity>
        <Text style={[ss.title, { color: g.text }]}>Holiday Calendar</Text>
        <TouchableOpacity onPress={openAdd} style={[ss.addBtn, { backgroundColor: g.accent }]}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>+</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={ss.centered}>
          <ActivityIndicator size="large" color={g.accent} />
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.key}
          contentContainerStyle={ss.list}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <Text style={[ss.yearHeader, { color: g.textDim }]}>{item.year}</Text>
              );
            }
            return renderHoliday({ item });
          }}
          ListEmptyComponent={
            <View style={ss.emptyBox}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🎉</Text>
              <Text style={[{ fontSize: 16, fontWeight: '700', color: g.textMuted }]}>No holidays yet</Text>
              <Text style={[{ fontSize: 13, color: g.textDim, marginTop: 6, textAlign: 'center' }]}>
                Tap + to add public holidays. They will be excluded from attendance rate calculations.
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <HolidayFormModal
        visible={modalVisible}
        holiday={editTarget}
        onClose={() => setModalVisible(false)}
        onSaved={() => { setModalVisible(false); loadHolidays(); }}
        g={g}
        grad={grad}
      />
    </LinearGradient>
  );
}

const ss = StyleSheet.create({
  fill:    { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14, gap: 12,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title:   { flex: 1, fontSize: 24, fontWeight: '900' },
  addBtn:  { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 8 },
  yearHeader: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8, marginBottom: 2 },

  card: { borderRadius: 16, borderWidth: 1, flexDirection: 'row', overflow: 'hidden' },
  typeBar: { width: 4 },
  cardContent: { flex: 1, flexDirection: 'row', padding: 14, alignItems: 'center' },
  hName: { fontSize: 15, fontWeight: '800' },
  hDate: { fontSize: 12, marginTop: 3 },
  typeBadge: { marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  cardActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },

  emptyBox: { alignItems: 'center', padding: 40 },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:   { borderRadius: 24, borderWidth: 1, padding: 24, paddingBottom: 36 },
  sheetTitle: { fontSize: 20, fontWeight: '900', marginBottom: 20 },
  label:   { fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input:   { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  typeChip: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn:    { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1 },
});
