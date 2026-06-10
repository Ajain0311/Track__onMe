// screens/admin/AdminDepartmentsScreen.js — Department CRUD for admins

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Alert, Modal, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../../store/themeStore';
import {
  adminGetDepartments, adminCreateDepartment, adminUpdateDepartment,
  adminDeleteDepartment, getApiErrorMessage,
} from '../../services/api';
import { useToast } from '../../components/ToastProvider';
import ScreenHeader from '../../components/ScreenHeader';
import EmptyState from '../../components/EmptyState';

const PRESET_COLORS = [
  '#6c63ff','#ff6584','#43e97b','#f7971e','#4facfe',
  '#fa709a','#30d158','#ff9f0a','#64d2ff','#bf5af2',
];

function ColorPicker({ value, onChange, g }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
      {PRESET_COLORS.map((c) => (
        <TouchableOpacity
          key={c}
          onPress={() => onChange(c)}
          style={[
            { width: 28, height: 28, borderRadius: 14, backgroundColor: c },
            value === c && { borderWidth: 3, borderColor: g.text },
          ]}
        />
      ))}
    </View>
  );
}

function DeptFormModal({ visible, dept, onClose, onSaved, g, grad }) {
  const toast = useToast();
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor]             = useState(PRESET_COLORS[0]);
  const [saving, setSaving]           = useState(false);

  // Reset when modal opens
  React.useEffect(() => {
    if (!visible) return;
    setName(dept?.name || '');
    setDescription(dept?.description || '');
    setColor(dept?.color || PRESET_COLORS[0]);
  }, [visible, dept]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Department name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), description: description.trim() || null, color };
      if (dept) {
        await adminUpdateDepartment(dept.id, payload);
        toast.success('Department updated!');
      } else {
        await adminCreateDepartment(payload);
        toast.success('Department created!');
      }
      onSaved();
      onClose();
    } catch (e) {
      const msg = getApiErrorMessage(e);
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sf.overlay}>
        <LinearGradient colors={grad.card} style={[sf.modal, { borderColor: g.border }]}>
          <Text style={[sf.modalTitle, { color: g.text }]}>{dept ? 'Edit Department' : 'New Department'}</Text>

          <Text style={[sf.lbl, { color: g.textMuted }]}>Name *</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Engineering"
            placeholderTextColor={g.textDim}
            style={[sf.input, { color: g.text, backgroundColor: g.glass, borderColor: g.border }]}
            maxLength={100}
            autoFocus
          />

          <Text style={[sf.lbl, { color: g.textMuted }]}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Optional description"
            placeholderTextColor={g.textDim}
            style={[sf.textarea, { color: g.text, backgroundColor: g.glass, borderColor: g.border }]}
            maxLength={500}
            multiline
            numberOfLines={3}
          />

          <Text style={[sf.lbl, { color: g.textMuted }]}>Color</Text>
          <View style={[sf.colorRow, { backgroundColor: `${color}22`, borderColor: color }]}>
            <View style={[sf.swatch, { backgroundColor: color }]} />
            <Text style={[{ color: g.text, fontSize: 13, fontWeight: '700' }]}>{color}</Text>
          </View>
          <ColorPicker value={color} onChange={setColor} g={g} />

          <View style={sf.modalBtns}>
            <TouchableOpacity onPress={onClose} style={[sf.cancelBtn, { borderColor: g.border }]}>
              <Text style={{ color: g.textMuted, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={[sf.saveBtn, { backgroundColor: color, opacity: saving ? 0.7 : 1 }]}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={sf.saveTxt}>{dept ? 'Save Changes' : 'Create'}</Text>}
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

function DeptCard({ dept, onEdit, onDelete, g, grad }) {
  return (
    <LinearGradient colors={grad.card} style={[s.card, { borderColor: g.border }]}>
      <View style={[s.colorBar, { backgroundColor: dept.color }]} />
      <View style={s.cardBody}>
        <View style={s.cardRow}>
          <Text style={[s.deptName, { color: g.text }]}>{dept.name}</Text>
          <View style={[s.countBadge, { backgroundColor: `${dept.color}22`, borderColor: dept.color }]}>
            <Text style={[s.countTxt, { color: dept.color }]}>{dept.memberCount ?? 0} members</Text>
          </View>
        </View>
        {!!dept.description && (
          <Text style={[s.desc, { color: g.textMuted }]} numberOfLines={2}>{dept.description}</Text>
        )}
        <View style={s.cardActions}>
          <TouchableOpacity onPress={() => onEdit(dept)} style={[s.actionBtn, { borderColor: g.border }]}>
            <Text style={[s.actionTxt, { color: g.text }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(dept)} style={[s.actionBtn, s.deleteBtnBorder]}>
            <Text style={[s.actionTxt, { color: '#ff453a' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}

export default function AdminDepartmentsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [departments, setDepartments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing]         = useState(null); // null = new dept

  const loadDepts = useCallback(() => {
    setLoading(true);
    adminGetDepartments()
      .then((r) => setDepartments(r.data.departments || []))
      .catch((e) => toast.error(getApiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(loadDepts);

  const openNew  = () => { setEditing(null); setModalVisible(true); };
  const openEdit = (dept) => { setEditing(dept); setModalVisible(true); };

  const handleDelete = (dept) => {
    const proceed = async () => {
      try {
        await adminDeleteDepartment(dept.id);
        toast.success(`Deleted "${dept.name}"`);
        loadDepts();
      } catch (e) {
        toast.error(getApiErrorMessage(e));
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete department "${dept.name}"? Members will be unassigned.`)) proceed();
    } else {
      Alert.alert(
        'Delete Department',
        `Delete "${dept.name}"? Members will be unassigned.`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: proceed }],
      );
    }
  };

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <ScreenHeader
        title="Departments"
        onBack={() => navigation.goBack()}
        rightAction={{ label: '+ New', onPress: openNew }}
      />

      {loading ? (
        <View style={s.center}><ActivityIndicator color={g.accent} size="large" /></View>
      ) : departments.length === 0 ? (
        <EmptyState
          title="No Departments"
          description="Create your first department to organize employees."
          actionLabel="+ Create Department"
          onAction={openNew}
        />
      ) : (
        <FlatList
          data={departments}
          keyExtractor={(d) => d.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <DeptCard dept={item} onEdit={openEdit} onDelete={handleDelete} g={g} grad={grad} />
          )}
        />
      )}

      <DeptFormModal
        visible={modalVisible}
        dept={editing}
        onClose={() => setModalVisible(false)}
        onSaved={loadDepts}
        g={g}
        grad={grad}
      />
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill:   { flex: 1 },
  list:   { padding: 20, paddingBottom: 100 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card:    { flexDirection: 'row', borderRadius: 16, borderWidth: 1, marginBottom: 14, overflow: 'hidden' },
  colorBar:{ width: 6 },
  cardBody:{ flex: 1, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  deptName:{ fontSize: 16, fontWeight: '800', flex: 1 },
  countBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  countTxt:    { fontSize: 11, fontWeight: '700' },
  desc:        { fontSize: 13, marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn:   { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  deleteBtnBorder: { borderColor: '#ff453a33' },
  actionTxt:   { fontSize: 13, fontWeight: '700' },
});

const sf = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modal:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 24, paddingBottom: 40 },
  modalTitle:{ fontSize: 18, fontWeight: '900', marginBottom: 20 },
  lbl:       { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  input:     { borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 14 },
  textarea:  { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  colorRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  swatch:    { width: 20, height: 20, borderRadius: 10 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  saveBtn:   { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveTxt:   { color: '#fff', fontWeight: '800', fontSize: 15 },
});
