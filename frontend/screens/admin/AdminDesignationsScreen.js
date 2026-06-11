// screens/admin/AdminDesignationsScreen.js — Designation CRUD

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import useThemeStore from '../../store/themeStore';
import {
  adminGetDesignations, adminCreateDesignation, adminUpdateDesignation, adminDeleteDesignation,
  getApiErrorMessage,
} from '../../services/api';
import { useToast } from '../../components/ToastProvider';

const EMPTY_FORM = { name: '', level: '1' };

export default function AdminDesignationsScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [designations, setDesignations] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing]           = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminGetDesignations();
      setDesignations(res.data.designations || []);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setModalVisible(true); };
  const openEdit   = (d) => { setEditing(d); setForm({ name: d.name, level: String(d.level) }); setModalVisible(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    const level = parseInt(form.level, 10);
    if (isNaN(level) || level < 1 || level > 20) { toast.error('Level must be 1–20'); return; }
    setSaving(true);
    try {
      if (editing) {
        await adminUpdateDesignation(editing.id, { name: form.name.trim(), level });
        toast.success('Designation updated');
      } else {
        await adminCreateDesignation({ name: form.name.trim(), level });
        toast.success('Designation created');
      }
      setModalVisible(false);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await adminDeleteDesignation(id);
      toast.success('Deleted');
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const toggleActive = async (d) => {
    try {
      await adminUpdateDesignation(d.id, { isActive: !d.is_active });
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={{ fontSize: 22, color: g.text }}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: g.text }]}>Designations</Text>
        <TouchableOpacity onPress={openCreate} style={[s.addBtn, { backgroundColor: g.accent }]}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>+</Text>
        </TouchableOpacity>
      </View>

      <Text style={[s.hint, { color: g.textDim }]}>
        Employees pick from these designations in their profile. Level (1–20) controls sort order.
      </Text>

      {loading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={g.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {designations.map((d) => (
            <LinearGradient key={d.id} colors={grad.card}
              style={[s.card, { borderColor: d.is_active ? g.border : g.glass, opacity: d.is_active ? 1 : 0.55 }]}>
              <View style={[s.levelBadge, { backgroundColor: g.accentSoft }]}>
                <Text style={{ color: g.accent, fontWeight: '900', fontSize: 12 }}>L{d.level}</Text>
              </View>
              <Text style={[s.name, { color: g.text, flex: 1 }]}>{d.name}</Text>
              <View style={s.actions}>
                <TouchableOpacity onPress={() => toggleActive(d)}
                  style={[s.iconBtn, { backgroundColor: d.is_active ? 'rgba(62,232,199,0.15)' : g.glass }]}>
                  <Text style={{ fontSize: 14 }}>{d.is_active ? '✓' : '○'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openEdit(d)}
                  style={[s.iconBtn, { backgroundColor: g.accentSoft }]}>
                  <Text style={{ fontSize: 14 }}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(d.id)}
                  style={[s.iconBtn, { backgroundColor: g.errorBg }]}>
                  <Text style={{ fontSize: 14 }}>🗑</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={m.overlay}>
          <LinearGradient colors={grad.card} style={[m.sheet, { borderColor: g.border }]}>
            <Text style={[m.title, { color: g.text }]}>{editing ? 'Edit Designation' : 'New Designation'}</Text>
            <Text style={[m.label, { color: g.textMuted }]}>Name</Text>
            <TextInput
              style={[m.input, { backgroundColor: g.glass, borderColor: g.border, color: g.text }]}
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="e.g. Senior Engineer"
              placeholderTextColor={g.textDim}
            />
            <Text style={[m.label, { color: g.textMuted }]}>Level (1–20, lower = junior)</Text>
            <TextInput
              style={[m.input, { backgroundColor: g.glass, borderColor: g.border, color: g.text }]}
              value={form.level}
              onChangeText={(v) => setForm((f) => ({ ...f, level: v }))}
              keyboardType="numeric"
              maxLength={2}
            />
            <View style={m.btnRow}>
              <TouchableOpacity onPress={() => setModalVisible(false)}
                style={[m.btn, { backgroundColor: g.glass, borderColor: g.border }]}>
                <Text style={{ color: g.textMuted, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={saving}
                style={[m.btn, { backgroundColor: g.accent, opacity: saving ? 0.6 : 1 }]}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Save</Text>}
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
  topBar:  { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 10, gap: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title:   { flex: 1, fontSize: 22, fontWeight: '900' },
  addBtn:  { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hint:    { fontSize: 12, paddingHorizontal: 20, marginBottom: 8, lineHeight: 18 },
  centered:{ flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20, gap: 8 },
  card:    { borderRadius: 14, padding: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  name:    { fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});

const m = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, gap: 10 },
  title:   { fontSize: 20, fontWeight: '900', marginBottom: 4 },
  label:   { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  input:   { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  btnRow:  { flexDirection: 'row', gap: 10, marginTop: 6 },
  btn:     { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
});
