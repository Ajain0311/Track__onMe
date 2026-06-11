// screens/EditProfileScreen.js — Employee self-service profile editor

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import useAuthStore from '../store/authStore';
import { getMyProfile, updateMyProfile, getDepartments, getDesignations, getApiErrorMessage } from '../services/api';
import { useToast } from '../components/ToastProvider';
import ScreenHeader from '../components/ScreenHeader';

function Field({ label, value, onChangeText, placeholder, g, keyboardType, maxLength, multiline }) {
  return (
    <View style={s.field}>
      <Text style={[s.label, { color: g.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || ''}
        placeholderTextColor={g.textDim}
        keyboardType={keyboardType || 'default'}
        maxLength={maxLength || 200}
        multiline={multiline || false}
        numberOfLines={multiline ? 3 : 1}
        style={[
          multiline ? s.textarea : s.input,
          { color: g.text, backgroundColor: g.glass, borderColor: g.border },
        ]}
      />
    </View>
  );
}

export default function EditProfileScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const { user } = useAuthStore();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [designationsList, setDesignationsList] = useState([]);

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [joinedDate, setJoinedDate] = useState('');
  const [bio, setBio] = useState('');
  const [departmentId, setDepartmentId] = useState(null);

  useEffect(() => {
    Promise.all([getMyProfile(), getDepartments(), getDesignations().catch(() => ({ data: { designations: [] } }))])
      .then(([profileRes, deptRes, desigRes]) => {
        const p = profileRes.data.profile;
        if (p) {
          setDisplayName(p.displayName || '');
          setPhone(p.phone || '');
          setDesignation(p.designation || '');
          setEmployeeId(p.employeeId || '');
          setJoinedDate(p.joinedDate || '');
          setBio(p.bio || '');
          setDepartmentId(p.departmentId || null);
        }
        setDepartments(deptRes.data.departments || []);
        setDesignationsList(desigRes.data.designations || []);
      })
      .catch((e) => toast.error(getApiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMyProfile({
        displayName: displayName.trim() || null,
        phone:       phone.trim() || null,
        designation: designation.trim() || null,
        employeeId:  employeeId.trim() || null,
        joinedDate:  joinedDate || null,
        bio:         bio.trim() || null,
        departmentId: departmentId || null,
      });
      toast.success('Profile saved!');
      navigation.goBack();
    } catch (e) {
      const msg = getApiErrorMessage(e);
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Save failed', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={grad.screen} style={s.fill}>
        <ScreenHeader title="Edit Profile" onBack={() => navigation.goBack()} />
        <View style={s.center}><ActivityIndicator color={g.accent} size="large" /></View>
      </LinearGradient>
    );
  }

  const selectedDept = departments.find((d) => d.id === departmentId);

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <ScreenHeader title="Edit Profile" onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">

        {/* Avatar / email (read-only) */}
        <LinearGradient colors={grad.card} style={[s.profileCard, { borderColor: g.border }]}>
          <View style={[s.avatar, { backgroundColor: g.accentSoft, borderColor: g.borderGlow }]}>
            <Text style={{ color: g.accent, fontSize: 28, fontWeight: '900' }}>
              {(displayName || user?.email || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.profileEmail, { color: g.text }]} numberOfLines={1}>{user?.email}</Text>
            <Text style={[s.profileHint, { color: g.textMuted }]}>Email cannot be changed here</Text>
          </View>
        </LinearGradient>

        {/* Personal info */}
        <Text style={[s.sectionTitle, { color: g.textMuted }]}>PERSONAL INFO</Text>
        <Field label="Full Name" value={displayName} onChangeText={setDisplayName} placeholder="Your full name" g={g} maxLength={100} />
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" g={g} keyboardType="phone-pad" maxLength={30} />
        <Field label="Bio" value={bio} onChangeText={setBio} placeholder="A short bio…" g={g} maxLength={500} multiline />

        {/* Work info */}
        <Text style={[s.sectionTitle, { color: g.textMuted, marginTop: 20 }]}>WORK INFO</Text>
        {designationsList.length > 0 ? (
          <View style={s.field}>
            <Text style={[s.label, { color: g.textMuted }]}>Designation / Title</Text>
            <View style={s.deptGrid}>
              <TouchableOpacity
                onPress={() => setDesignation('')}
                style={[s.deptCard, { borderColor: !designation ? g.accent : g.border, backgroundColor: !designation ? g.accentSoft : g.glass }]}
              >
                <Text style={[s.deptName, { color: !designation ? g.accent : g.textMuted }]}>None</Text>
              </TouchableOpacity>
              {designationsList.map((d) => {
                const sel = designation === d.name;
                return (
                  <TouchableOpacity key={d.id} onPress={() => setDesignation(d.name)}
                    style={[s.deptCard, { borderColor: sel ? g.accent : g.border, backgroundColor: sel ? g.accentSoft : g.glass }]}>
                    <Text style={[s.deptName, { color: sel ? g.accent : g.text }]}>{d.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : (
          <Field label="Designation / Title" value={designation} onChangeText={setDesignation} placeholder="e.g. Software Engineer" g={g} maxLength={100} />
        )}
        <Field label="Employee ID" value={employeeId} onChangeText={setEmployeeId} placeholder="e.g. EMP-001" g={g} maxLength={50} />
        {Platform.OS === 'web' ? (
          <View style={s.field}>
            <Text style={[s.label, { color: g.textMuted }]}>Joining Date</Text>
            <input
              type="date"
              value={joinedDate}
              onChange={(e) => setJoinedDate(e.target.value)}
              style={{
                background: g.glass, border: `1px solid ${g.border}`,
                color: g.text, borderRadius: 10, padding: '10px 14px',
                fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
              }}
            />
          </View>
        ) : (
          <Field label="Joining Date (YYYY-MM-DD)" value={joinedDate} onChangeText={setJoinedDate} placeholder="2024-01-15" g={g} maxLength={10} keyboardType="numbers-and-punctuation" />
        )}

        {/* Department selector */}
        <Text style={[s.sectionTitle, { color: g.textMuted, marginTop: 20 }]}>DEPARTMENT</Text>
        {departments.length === 0 ? (
          <View style={[s.noDepts, { backgroundColor: g.glass, borderColor: g.border }]}>
            <Text style={{ color: g.textMuted, fontSize: 13 }}>No departments configured yet. Ask your admin to set them up.</Text>
          </View>
        ) : (
          <View style={s.deptGrid}>
            <TouchableOpacity
              onPress={() => setDepartmentId(null)}
              style={[s.deptCard, { borderColor: !departmentId ? g.accent : g.border, backgroundColor: !departmentId ? g.accentSoft : g.glass }]}
            >
              <Text style={[s.deptName, { color: !departmentId ? g.accent : g.textMuted }]}>None</Text>
            </TouchableOpacity>
            {departments.map((d) => {
              const selected = departmentId === d.id;
              return (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => setDepartmentId(d.id)}
                  style={[s.deptCard, { borderColor: selected ? d.color : g.border, backgroundColor: selected ? `${d.color}22` : g.glass }]}
                >
                  <View style={[s.deptDot, { backgroundColor: d.color }]} />
                  <Text style={[s.deptName, { color: selected ? d.color : g.text }]}>{d.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Save */}
        <TouchableOpacity
          style={[s.saveBtn, { opacity: saving ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#8b7cff', '#6c63ff']} style={s.saveGrad}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>Save Profile</Text>}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill:   { flex: 1 },
  scroll: { flex: 1 },
  inner:  { padding: 20, paddingBottom: 100 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 20 },
  avatar: { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  profileEmail: { fontSize: 14, fontWeight: '700' },
  profileHint:  { fontSize: 11, marginTop: 3 },

  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 },

  field:    { marginBottom: 14 },
  label:    { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input:    { borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 14 },
  textarea: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14, minHeight: 90, textAlignVertical: 'top' },

  noDepts: { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 10 },

  deptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  deptCard: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  deptDot:  { width: 8, height: 8, borderRadius: 4 },
  deptName: { fontSize: 13, fontWeight: '700' },

  saveBtn:  { borderRadius: 16, overflow: 'hidden', marginTop: 24 },
  saveGrad: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
