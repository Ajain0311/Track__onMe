// components/LoadingState.js — centered spinner + optional message

import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import useThemeStore from '../store/themeStore';

export default function LoadingState({ message, size = 'large' }) {
  const { colors: g } = useThemeStore();
  return (
    <View style={s.wrap}>
      <ActivityIndicator size={size} color={g.accent} />
      {message ? <Text style={[s.msg, { color: g.textMuted }]}>{message}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  msg:  { marginTop: 14, fontSize: 13, fontWeight: '600' },
});
