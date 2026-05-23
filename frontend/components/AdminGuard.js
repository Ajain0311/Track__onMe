// components/AdminGuard.js — wrap admin screens so non-admin users see a denial
// instead of a half-broken admin UI when isAdmin is false.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useAuthStore from '../store/authStore';
import useThemeStore from '../store/themeStore';

export default function AdminGuard({ children, fallbackMessage, onBack }) {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const { colors: g, gradients: grad } = useThemeStore();

  if (isAdmin) return children;

  return (
    <LinearGradient colors={grad.screen} style={s.fill}>
      <View style={s.center}>
        <Text style={s.icon}>🔒</Text>
        <Text style={[s.title, { color: g.text }]}>Admin access required</Text>
        <Text style={[s.msg,  { color: g.textMuted }]}>
          {fallbackMessage ||
            'This screen is restricted to admin users. If you believe this is a mistake, try the “Reload Admin Access” button in Settings.'}
        </Text>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={[s.btn, { backgroundColor: g.accent }]}>
            <Text style={s.btnText}>Go back</Text>
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  icon: { fontSize: 56, marginBottom: 18 },
  title: { fontSize: 22, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  msg: { fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 340 },
  btn: { marginTop: 26, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28 },
  btnText: { color: '#fff', fontWeight: '800' },
});
