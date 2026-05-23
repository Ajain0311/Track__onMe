// screens/ChangePasswordScreen.js — change password via Supabase Auth

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../store/themeStore';
import { supabase } from '../services/supabaseConfig';
import ScreenHeader from '../components/ScreenHeader';
import { useToast } from '../components/ToastProvider';

export default function ChangePasswordScreen({ navigation }) {
  const { colors: g, gradients: grad } = useThemeStore();
  const toast = useToast();

  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const validate = () => {
    if (next.length < 8)   return 'Password must be at least 8 characters.';
    if (!/[a-z]/.test(next) || !/[0-9]/.test(next)) return 'Use at least one letter and one number.';
    if (next !== confirm)  return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      toast.success('Password updated.');
      setTimeout(() => navigation.goBack(), 1200);
    } catch (e) {
      toast.error(e?.message || 'Could not update password.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [st.input, { backgroundColor: g.glass, borderColor: g.border, color: g.text }];

  return (
    <LinearGradient colors={grad.screen} style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title="Change password" subtitle="Pick something you can remember" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={[st.label, { color: g.textMuted }]}>NEW PASSWORD</Text>
          <TextInput
            style={inputStyle}
            placeholder="At least 8 characters, one letter + one number"
            placeholderTextColor={g.textDim}
            secureTextEntry={!show}
            value={next}
            onChangeText={setNext}
            autoCapitalize="none"
          />

          <Text style={[st.label, { color: g.textMuted, marginTop: 16 }]}>CONFIRM</Text>
          <TextInput
            style={inputStyle}
            placeholder="Repeat new password"
            placeholderTextColor={g.textDim}
            secureTextEntry={!show}
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="none"
            onSubmitEditing={handleSubmit}
          />

          <TouchableOpacity onPress={() => setShow((v) => !v)} style={{ marginTop: 10 }}>
            <Text style={{ color: g.accent, fontSize: 12, fontWeight: '700' }}>
              {show ? '🙈 Hide passwords' : '👁 Show passwords'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[st.submit, { backgroundColor: saving ? g.textDim : g.accent }]}
            onPress={handleSubmit}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={st.submitText}>Update Password</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  label:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  input:  { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14 },
  submit: { marginTop: 24, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
