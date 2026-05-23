// components/EmptyState.js — reusable empty placeholder

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import useThemeStore from '../store/themeStore';

export default function EmptyState({
  icon = '📭',
  title = 'Nothing here yet',
  description,
  actionLabel,
  onAction,
  compact = false,
}) {
  const { colors: g } = useThemeStore();
  return (
    <View style={[s.wrap, compact && s.wrapCompact]}>
      <Text style={[s.icon, compact && { fontSize: 36 }]}>{icon}</Text>
      <Text style={[s.title, { color: g.text }]} numberOfLines={2}>{title}</Text>
      {description && (
        <Text style={[s.desc, { color: g.textMuted }]} numberOfLines={3}>{description}</Text>
      )}
      {actionLabel && onAction && (
        <TouchableOpacity onPress={onAction} style={[s.btn, { backgroundColor: g.accent }]}>
          <Text style={s.btnText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: 40, paddingTop: 60 },
  wrapCompact: { padding: 24, paddingTop: 32 },
  icon: { fontSize: 52, marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  desc:  { fontSize: 13, fontWeight: '500', textAlign: 'center', marginTop: 8, lineHeight: 18, maxWidth: 320 },
  btn:   { marginTop: 20, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 22 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
