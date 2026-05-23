// components/ScreenHeader.js — consistent screen header with back button + title

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import useThemeStore from '../store/themeStore';

export default function ScreenHeader({ title, subtitle, onBack, right }) {
  const { colors: g } = useThemeStore();
  return (
    <View style={s.wrap}>
      <View style={s.row}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={s.back}>
            <Text style={{ color: g.accent, fontSize: 15, fontWeight: '700' }}>← Back</Text>
          </TouchableOpacity>
        ) : <View />}
        <View style={{ flex: 1 }} />
        {right || null}
      </View>
      <Text style={[s.title, { color: g.text }]} numberOfLines={1}>{title}</Text>
      {subtitle ? (
        <Text style={[s.subtitle, { color: g.textMuted }]} numberOfLines={2}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:    { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12 },
  row:     { flexDirection: 'row', alignItems: 'center', marginBottom: 14, minHeight: 24 },
  back:    { paddingVertical: 4, paddingRight: 8 },
  title:   { fontSize: 26, fontWeight: '900', letterSpacing: -0.3 },
  subtitle:{ fontSize: 13, marginTop: 4, lineHeight: 19 },
});
