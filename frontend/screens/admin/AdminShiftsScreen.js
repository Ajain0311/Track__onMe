// screens/admin/AdminShiftsScreen.js — Shift management CRUD + assignments

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../../store/themeStore';
import {
  adminGetShifts, adminCreateShift, adminUpdateShift, adminDeleteShift,
  adminGetAssignments, adminGetUsers, adminAssignShift, adminRemoveAssignment,
  getApiErrorMessage,
} from '../../services/api';
import { useToast } from '../../components/ToastProvider';

const COLORS = ['#8b7cff', '#3ee8c7', '#ffb347', '#e5534b', '#4facfe', '#f093fb'];
const pad2 = (n) => String(n).padStart(2, '0');
const fmtTime = (h, m) => `${pad2(h)}:${pad2(m)}`;

function ShiftBadge({ shift, g }) {
  return (
    <View style={[sb.badge, { backgroundColor: shift.color + '22', borderColor: shift.color + '66' }]}>
      <View style={[sb.dot, { backgroundColor: shift.color }]} />
      <Text style={[sb.name, { color: g.text }]}>{shift.name}</Text>
      <Text style={[sb.time, { color: g.textMuted }]}>
        {fmtTime(shift.start_hour, shift.start_minute)} – {fmtTime(shift.end_hour, shift.end_minute)}
      </Text>
    </View>
  );
}

const EMPTY_FORM = { name: '', startHour: 9, startMin: 0, endHour: 18, endMin: 0, grace: 15, color: COLORS[0] };

function ShiftFormModal({ visible, initial, onClose, onSave, g, grad }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Shift name is required'); return; }
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        startHour: form.startHour, startMinute: form.startMin,
        endHour: form.endHour, endMinute: form.endMin,
        lateGraceMinutes: form.grace, color: form.color,
      });
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // sync when initial changes
  React.useEffect(() => { if (visible) setForm(initial || EMPTY_FORM); }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mf.overlay}>
        <LinearGradient colors={grad.card} style={[mf.sheet, { borderColor: g.border }]}>
          <Text style={[mf.title, { color: g.text }]}>{initial ? 'Edit Shift' : 'New Shift'}</Text>

          <Text style={[mf.label, { color: g.textMuted }]}>Name</Text>
          <TextInput
            style={[mf.input, { backgroundColor: g.glass, borderColor: g.border, color: g.text }]}
            value={form.name}
            onChangeText={(v) => set('name', v)}
            placeholder="e.g. Morning Shift"
            placeholderTextColor={g.textDim}
          />

          <Text style={[mf.label, { color: g.textMuted }]}>Start Time</Text>
          <View style={mf.timeRow}>
            <TextInput style={[mf.timeInput, { backgroundColor: g.glass, borderColor: g.border, color: g.text }]}
              value={String(form.startHour)} keyboardType="numeric" maxLength={2}
              onChangeText={(v) => { const n = parseInt(v, 10); if (!isNaN(n) && n >= 0 && n <= 23) set('startHour', n); }} />
            <Text style={[mf.colon, { color: g.textMuted }]}>:</Text>
            <TextInput style={[mf.timeInput, { backgroundColor: g.glass, borderColor: g.border, color: g.text }]}
              value={String(form.startMin)} keyboardType="numeric" maxLength={2}
              onChangeText={(v) => { const n = parseInt(v, 10); if (!isNaN(n) && n >= 0 && n <= 59) set('startMin', n); }} />
          </View>

          <Text style={[mf.label, { color: g.textMuted }]}>End Time</Text>
          <View style={mf.timeRow}>
            <TextInput style={[mf.timeInput, { backgroundColor: g.glass, borderColor: g.border, color: g.text }]}
              value={String(form.endHour)} keyboardType="numeric" maxLength={2}
              onChangeText={(v) => { const n = parseInt(v, 10); if (!isNaN(n) && n >= 0 && n <= 23) set('endHour', n); }} />
            <Text style={[mf.colon, { color: g.textMuted }]}>:</Text>
            <TextInput style={[mf.timeInput, { backgroundColor: g.glass, borderColor: g.border, color: g.text }]}
              value={String(form.endMin)} keyboardType="numeric" maxLength={2}
              onChangeText={(v) => { const n = parseInt(v, 10); if (!isNaN(n) && n >= 0 && n <= 59) set('endMin', n); }} />
          </View>

          <Text style={[mf.label, { color: g.textMuted }]}>Late Grace (minutes)</Text>
          <TextInput style={[mf.input, { backgroundColor: g.glass, borderColor: g.border, color: g.text }]}
            value={String(form.grace)} keyboardType="numeric" maxLength={3}
            onChangeText={(v) => { const n = parseInt(v, 10); if (!isNaN(n) && n >= 0 && n <= 120) set('grace', n); }} />

          <Text style={[mf.label, { color: g.textMuted }]}>Color</Text>
          <View style={mf.colorRow}>
            {COLORS.map((c) => (
              <TouchableOpacity key={c} onPress={() => set('color', c)}
                style={[mf.colorDot, { backgroundColor: c, borderWidth: form.color === c ? 3 : 0, borderColor: '#fff' }]} />
            ))}
          </View>

          <View style={mf.btnRow}>
            <TouchableOpacity onPress={onClose} style={[mf.btn, { backgroundColor: g.glass, borderColor: g.border }]}>
              <Text style={{ color: g.textMuted, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} disabled={saving}
              style={[mf.btn, { backgroundColor: g.accent, opacity: saving ? 0.6 : 1 }]}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Save</Text>}
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function AdminShiftsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('shifts');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [assignUserId, setAssignUserId] = useState(null);
  const [assignShiftId, setAssignShiftId] = useState(null);
  const [assignModal, setAssignModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shiftsRes, assignRes, usersRes] = await Promise.allSettled([
        adminGetShifts(),
        adminGetAssignments(),
        adminGetUsers(1),
      ]);
      if (shiftsRes.status === 'fulfilled') setShifts(shiftsRes.value.data.shifts || []);
      if (assignRes.status === 'fulfilled') setAssignments(assignRes.value.data.assignments || []);
      if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data.users || []);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => { setEditing(null); setModalVisible(true); };
  const openEdit   = (shift) => {
    setEditing({
      id: shift.id,
      name: shift.name,
      startHour: shift.start_hour,
      startMin:  shift.start_minute,
      endHour:   shift.end_hour,
      endMin:    shift.end_minute,
      grace:     shift.late_grace_minutes,
      color:     shift.color,
    });
    setModalVisible(true);
  };

  const handleSave = async (payload) => {
    if (editing?.id) {
      await adminUpdateShift(editing.id, payload);
      toast.success('Shift updated');
    } else {
      await adminCreateShift(payload);
      toast.success('Shift created');
    }
    await load();
  };

  const handleDelete = async (id) => {
    try {
      await adminDeleteShift(id);
      toast.success('Shift deleted');
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const openAssignModal = (userId) => {
    setAssignUserId(userId);
    setAssignShiftId(shifts[0]?.id || null);
    setAssignModal(true);
  };

  const saveAssignment = async () => {
    if (!assignUserId || !assignShiftId) return;
    try {
      await adminAssignShift(assignUserId, assignShiftId);
      toast.success('Shift assigned');
      setAssignModal(false);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const removeAssign = async (userId) => {
    try {
      await adminRemoveAssignment(userId);
      toast.success('Assignment removed');
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const assignMap = {};
  assignments.forEach((a) => { assignMap[a.user_id] = a; });

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      {/* Header */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={{ fontSize: 22, color: g.text }}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: g.text }]}>Shift Management</Text>
        {activeTab === 'shifts' && (
          <TouchableOpacity onPress={openCreate}
            style={[s.addBtn, { backgroundColor: g.accent }]}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={[s.tabBar, { borderBottomColor: g.border }]}>
        {['shifts', 'assignments'].map((tab) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
            style={[s.tabBtn, activeTab === tab && { borderBottomColor: g.accent, borderBottomWidth: 2 }]}>
            <Text style={[s.tabLabel, { color: activeTab === tab ? g.accent : g.textMuted }]}>
              {tab === 'shifts' ? 'Shifts' : 'Assignments'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={g.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

          {activeTab === 'shifts' && (
            <>
              {shifts.length === 0 && (
                <View style={s.empty}>
                  <Text style={{ fontSize: 40 }}>🕐</Text>
                  <Text style={[s.emptyText, { color: g.textMuted }]}>No shifts yet. Tap + to create one.</Text>
                </View>
              )}
              {shifts.map((shift) => (
                <LinearGradient key={shift.id} colors={grad.card}
                  style={[s.card, { borderColor: shift.color + '55', borderLeftWidth: 4, borderLeftColor: shift.color }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.shiftName, { color: g.text }]}>{shift.name}</Text>
                    <Text style={[s.shiftTime, { color: g.textMuted }]}>
                      {fmtTime(shift.start_hour, shift.start_minute)} – {fmtTime(shift.end_hour, shift.end_minute)}
                      {'  ·  '}Grace: {shift.late_grace_minutes}m
                    </Text>
                    <View style={[s.activeChip, { backgroundColor: shift.is_active ? g.mint + '22' : g.glass, borderColor: shift.is_active ? g.mint : g.border }]}>
                      <Text style={{ color: shift.is_active ? g.mint : g.textDim, fontSize: 11, fontWeight: '700' }}>
                        {shift.is_active ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>
                  <View style={s.rowActions}>
                    <TouchableOpacity onPress={() => openEdit(shift)} style={[s.iconBtn, { backgroundColor: g.accentSoft }]}>
                      <Text style={{ fontSize: 16 }}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(shift.id)} style={[s.iconBtn, { backgroundColor: g.errorBg }]}>
                      <Text style={{ fontSize: 16 }}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                </LinearGradient>
              ))}
            </>
          )}

          {activeTab === 'assignments' && (
            <>
              <Text style={[s.hint, { color: g.textDim }]}>
                Assign employees to specific shifts. Unassigned employees use the default org schedule.
              </Text>
              {users.map((user) => {
                const asgn = assignMap[user.id];
                const shift = asgn?.shifts;
                return (
                  <LinearGradient key={user.id} colors={grad.card} style={[s.card, { borderColor: g.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.userName, { color: g.text }]}>{user.email}</Text>
                      {shift
                        ? <ShiftBadge shift={shift} g={g} />
                        : <Text style={[s.noShift, { color: g.textDim }]}>Default schedule</Text>}
                    </View>
                    <View style={s.rowActions}>
                      <TouchableOpacity onPress={() => openAssignModal(user.id)}
                        style={[s.iconBtn, { backgroundColor: g.accentSoft }]}>
                        <Text style={{ fontSize: 16 }}>🔄</Text>
                      </TouchableOpacity>
                      {asgn && (
                        <TouchableOpacity onPress={() => removeAssign(user.id)}
                          style={[s.iconBtn, { backgroundColor: g.errorBg }]}>
                          <Text style={{ fontSize: 16 }}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </LinearGradient>
                );
              })}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Shift form modal */}
      <ShiftFormModal
        visible={modalVisible}
        initial={editing}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        g={g}
        grad={grad}
      />

      {/* Assign shift modal */}
      <Modal visible={assignModal} transparent animationType="slide" onRequestClose={() => setAssignModal(false)}>
        <View style={mf.overlay}>
          <LinearGradient colors={grad.card} style={[mf.sheet, { borderColor: g.border }]}>
            <Text style={[mf.title, { color: g.text }]}>Assign Shift</Text>
            <Text style={[mf.label, { color: g.textMuted }]}>Select Shift</Text>
            {shifts.map((sh) => (
              <TouchableOpacity key={sh.id} onPress={() => setAssignShiftId(sh.id)}
                style={[mf.shiftOption, {
                  backgroundColor: assignShiftId === sh.id ? sh.color + '22' : g.glass,
                  borderColor:     assignShiftId === sh.id ? sh.color : g.border,
                }]}>
                <View style={[mf.colorDotSm, { backgroundColor: sh.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: g.text, fontWeight: '700', fontSize: 14 }]}>{sh.name}</Text>
                  <Text style={[{ color: g.textMuted, fontSize: 12 }]}>
                    {fmtTime(sh.start_hour, sh.start_minute)} – {fmtTime(sh.end_hour, sh.end_minute)}
                  </Text>
                </View>
                {assignShiftId === sh.id && <Text style={{ color: sh.color, fontSize: 18 }}>✓</Text>}
              </TouchableOpacity>
            ))}
            <View style={mf.btnRow}>
              <TouchableOpacity onPress={() => setAssignModal(false)}
                style={[mf.btn, { backgroundColor: g.glass, borderColor: g.border }]}>
                <Text style={{ color: g.textMuted, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveAssignment}
                style={[mf.btn, { backgroundColor: g.accent }]}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Assign</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill:    { flex: 1 },
  topBar:  { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title:   { flex: 1, fontSize: 22, fontWeight: '900' },
  addBtn:  { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  tabBar:   { flexDirection: 'row', borderBottomWidth: 1, marginHorizontal: 20 },
  tabBtn:   { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  content:  { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card:       { borderRadius: 16, padding: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  shiftName:  { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  shiftTime:  { fontSize: 12, marginBottom: 6 },
  activeChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },

  userName: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  noShift:  { fontSize: 12, fontStyle: 'italic' },

  rowActions: { flexDirection: 'row', gap: 8 },
  iconBtn:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  hint:      { fontSize: 12, marginBottom: 8, lineHeight: 18 },
  empty:     { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },
});

// ShiftBadge styles
const sb = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
           paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginTop: 4 },
  dot:   { width: 8, height: 8, borderRadius: 4 },
  name:  { fontSize: 12, fontWeight: '700' },
  time:  { fontSize: 11 },
});

// Modal styles
const mf = StyleSheet.create({
  overlay:     { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, gap: 10 },
  title:       { fontSize: 20, fontWeight: '900', marginBottom: 6 },
  label:       { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  input:       { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  timeRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeInput:   { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, width: 60, textAlign: 'center' },
  colon:       { fontSize: 20, fontWeight: '900' },
  colorRow:    { flexDirection: 'row', gap: 12, marginBottom: 4 },
  colorDot:    { width: 32, height: 32, borderRadius: 16 },
  colorDotSm:  { width: 12, height: 12, borderRadius: 6 },
  shiftOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  btnRow:      { flexDirection: 'row', gap: 10, marginTop: 6 },
  btn:         { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
});
